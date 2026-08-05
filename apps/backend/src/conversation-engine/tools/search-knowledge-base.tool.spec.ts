import { SearchKnowledgeBaseTool } from "./search-knowledge-base.tool";

const CONTEXT = {
  workspaceId: "workspace-1",
  customerId: "customer-1",
  conversationId: "conv-1",
};

describe("SearchKnowledgeBaseTool", () => {
  it("searches via KnowledgeBaseService.searchWithRelevance and returns answer/sourceDocuments/confidence (Sprint 19)", async () => {
    const knowledgeBaseService = {
      searchWithRelevance: jest.fn().mockResolvedValue({
        answer: "Returns are accepted within 30 days.",
        sourceDocuments: [{ id: "kb-1", title: "Return Policy" }],
        confidence: 0.8,
      }),
    };
    const tool = new SearchKnowledgeBaseTool(knowledgeBaseService as never);

    const result = await tool.execute({ query: "returns" }, CONTEXT);

    expect(knowledgeBaseService.searchWithRelevance).toHaveBeenCalledWith(
      "workspace-1",
      "returns",
      5,
    );
    expect(JSON.parse(result.content)).toEqual({
      answer: "Returns are accepted within 30 days.",
      sourceDocuments: [{ id: "kb-1", title: "Return Policy" }],
      confidence: 0.8,
    });
  });

  it("returns a graceful error when query is missing or blank", async () => {
    const knowledgeBaseService = { searchWithRelevance: jest.fn() };
    const tool = new SearchKnowledgeBaseTool(knowledgeBaseService as never);

    const result = await tool.execute({ query: "   " }, CONTEXT);

    expect(JSON.parse(result.content).error).toBeDefined();
    expect(knowledgeBaseService.searchWithRelevance).not.toHaveBeenCalled();
  });

  it("passes through a zero-confidence empty answer when nothing matches", async () => {
    const knowledgeBaseService = {
      searchWithRelevance: jest.fn().mockResolvedValue({
        answer: "",
        sourceDocuments: [],
        confidence: 0,
      }),
    };
    const tool = new SearchKnowledgeBaseTool(knowledgeBaseService as never);

    const result = await tool.execute({ query: "nonexistent topic" }, CONTEXT);

    expect(JSON.parse(result.content)).toEqual({
      answer: "",
      sourceDocuments: [],
      confidence: 0,
    });
  });
});
