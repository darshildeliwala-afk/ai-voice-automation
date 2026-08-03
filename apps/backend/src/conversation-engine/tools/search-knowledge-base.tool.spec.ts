import { SearchKnowledgeBaseTool } from "./search-knowledge-base.tool";

const CONTEXT = {
  workspaceId: "workspace-1",
  customerId: "customer-1",
  conversationId: "conv-1",
};

describe("SearchKnowledgeBaseTool", () => {
  it("searches the workspace's knowledge base and returns matching entries", async () => {
    const knowledgeBaseService = {
      listKnowledgeBases: jest.fn().mockResolvedValue({
        data: [
          {
            title: "Return Policy",
            description: "How returns work",
            content: "Returns accepted within 30 days.",
          },
        ],
        meta: { page: 1, limit: 5, total: 1, totalPages: 1 },
      }),
    };
    const tool = new SearchKnowledgeBaseTool(knowledgeBaseService as never);

    const result = await tool.execute({ query: "returns" }, CONTEXT);

    expect(knowledgeBaseService.listKnowledgeBases).toHaveBeenCalledWith(
      "workspace-1",
      { page: 1, limit: 5 },
      "returns",
    );
    expect(JSON.parse(result.content)).toEqual({
      results: [
        {
          title: "Return Policy",
          description: "How returns work",
          content: "Returns accepted within 30 days.",
        },
      ],
    });
  });

  it("returns a graceful error when query is missing or blank", async () => {
    const knowledgeBaseService = { listKnowledgeBases: jest.fn() };
    const tool = new SearchKnowledgeBaseTool(knowledgeBaseService as never);

    const result = await tool.execute({ query: "   " }, CONTEXT);

    expect(JSON.parse(result.content).error).toBeDefined();
    expect(knowledgeBaseService.listKnowledgeBases).not.toHaveBeenCalled();
  });

  it("returns an empty results array when nothing matches", async () => {
    const knowledgeBaseService = {
      listKnowledgeBases: jest.fn().mockResolvedValue({
        data: [],
        meta: { page: 1, limit: 5, total: 0, totalPages: 0 },
      }),
    };
    const tool = new SearchKnowledgeBaseTool(knowledgeBaseService as never);

    const result = await tool.execute({ query: "nonexistent topic" }, CONTEXT);

    expect(JSON.parse(result.content)).toEqual({ results: [] });
  });
});
