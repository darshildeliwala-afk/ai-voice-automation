import { KnowledgeBaseService } from "./knowledge-base.service";

const WORKSPACE_ID = "workspace-1";

function setup() {
  const knowledgeBase = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const prisma = { knowledgeBase };
  const workspaceService = {
    getWorkspaceById: jest.fn().mockResolvedValue({ id: WORKSPACE_ID }),
  };

  const service = new KnowledgeBaseService(
    prisma as never,
    workspaceService as never,
  );

  return { service, prisma, knowledgeBase, workspaceService };
}

function makeUploadedFile(text: string) {
  return {
    buffer: Buffer.from(text, "utf-8"),
    originalname: "policy.txt",
    mimetype: "text/plain",
    size: text.length,
  };
}

describe("KnowledgeBaseService.searchWithRelevance", () => {
  it("returns empty results without querying when the query is blank", async () => {
    const { service, knowledgeBase } = setup();

    const result = await service.searchWithRelevance(WORKSPACE_ID, "   ");

    expect(result).toEqual({ answer: "", sourceDocuments: [], confidence: 0 });
    expect(knowledgeBase.findMany).not.toHaveBeenCalled();
  });

  it("returns empty results (never throws) when nothing matches", async () => {
    const { service, knowledgeBase } = setup();
    knowledgeBase.findMany.mockResolvedValue([]);

    const result = await service.searchWithRelevance(WORKSPACE_ID, "return policy");

    expect(result).toEqual({ answer: "", sourceDocuments: [], confidence: 0 });
  });

  it("ranks a title match above a body-only match and returns the top result's content as the answer", async () => {
    const { service, knowledgeBase } = setup();
    knowledgeBase.findMany.mockResolvedValue([
      {
        id: "kb-1",
        title: "Shipping FAQ",
        description: "General questions",
        content: "Mentions returns briefly.",
      },
      {
        id: "kb-2",
        title: "Return Policy",
        description: "How to return an item",
        content: "You can return any item within 30 days for a full refund.",
      },
    ]);

    const result = await service.searchWithRelevance(WORKSPACE_ID, "return policy");

    expect(result.sourceDocuments[0]).toEqual({ id: "kb-2", title: "Return Policy" });
    expect(result.answer).toBe(
      "You can return any item within 30 days for a full refund.",
    );
  });

  it("computes confidence as matched-terms / query-terms for the top result", async () => {
    const { service, knowledgeBase } = setup();
    knowledgeBase.findMany.mockResolvedValue([
      { id: "kb-1", title: "Return Policy", description: null, content: "Returns only." },
    ]);

    // "return policy shipping" -- only "return"/"policy" match, "shipping" doesn't.
    const result = await service.searchWithRelevance(
      WORKSPACE_ID,
      "return policy shipping",
    );

    expect(result.confidence).toBeCloseTo(2 / 3);
  });

  it("trims a long answer to an excerpt", async () => {
    const { service, knowledgeBase } = setup();
    const longContent = "return ".repeat(200); // > 500 chars
    knowledgeBase.findMany.mockResolvedValue([
      { id: "kb-1", title: "Return Policy", description: null, content: longContent },
    ]);

    const result = await service.searchWithRelevance(WORKSPACE_ID, "return");

    expect(result.answer.length).toBeLessThan(longContent.length);
    expect(result.answer.endsWith("...")).toBe(true);
  });

  it("limits results to the requested count", async () => {
    const { service, knowledgeBase } = setup();
    knowledgeBase.findMany.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({
        id: `kb-${i}`,
        title: "Return Policy",
        description: null,
        content: "Returns accepted.",
      })),
    );

    const result = await service.searchWithRelevance(WORKSPACE_ID, "return", 3);

    expect(result.sourceDocuments).toHaveLength(3);
  });
});

describe("KnowledgeBaseService.uploadKnowledgeBaseFile", () => {
  it("validates the workspace, decodes the file content, and creates an entry", async () => {
    const { service, knowledgeBase, workspaceService } = setup();
    knowledgeBase.create.mockResolvedValue({ id: "kb-1" });

    await service.uploadKnowledgeBaseFile(
      { workspaceId: WORKSPACE_ID, title: "Return Policy", description: "FAQ" },
      makeUploadedFile("Items can be returned within 30 days."),
    );

    expect(workspaceService.getWorkspaceById).toHaveBeenCalledWith(WORKSPACE_ID);
    expect(knowledgeBase.create).toHaveBeenCalledWith({
      data: {
        workspaceId: WORKSPACE_ID,
        title: "Return Policy",
        description: "FAQ",
        content: "Items can be returned within 30 days.",
      },
    });
  });

  it("rejects a file with no text content", async () => {
    const { service } = setup();

    await expect(
      service.uploadKnowledgeBaseFile(
        { workspaceId: WORKSPACE_ID, title: "Empty" },
        makeUploadedFile("   "),
      ),
    ).rejects.toThrow();
  });
});

describe("KnowledgeBaseService.reindexKnowledgeBase", () => {
  it("sets status READY when content is present", async () => {
    const { service, knowledgeBase } = setup();
    knowledgeBase.findFirst.mockResolvedValue({
      id: "kb-1",
      workspaceId: WORKSPACE_ID,
      content: "Some real content",
    });
    knowledgeBase.update.mockResolvedValue({ id: "kb-1", status: "READY" });

    await service.reindexKnowledgeBase("kb-1");

    expect(knowledgeBase.update).toHaveBeenCalledWith({
      where: { id: "kb-1" },
      data: { status: "READY" },
    });
  });

  it("sets status FAILED when content is empty or missing", async () => {
    const { service, knowledgeBase } = setup();
    knowledgeBase.findFirst.mockResolvedValue({
      id: "kb-1",
      workspaceId: WORKSPACE_ID,
      content: "   ",
    });
    knowledgeBase.update.mockResolvedValue({ id: "kb-1", status: "FAILED" });

    await service.reindexKnowledgeBase("kb-1");

    expect(knowledgeBase.update).toHaveBeenCalledWith({
      where: { id: "kb-1" },
      data: { status: "FAILED" },
    });
  });

  it("throws when the knowledge base doesn't exist", async () => {
    const { service, knowledgeBase } = setup();
    knowledgeBase.findFirst.mockResolvedValue(null);

    await expect(service.reindexKnowledgeBase("missing")).rejects.toThrow();
  });
});
