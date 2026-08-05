import { CallSummaryService } from "./call-summary.service";

const WORKSPACE_ID = "workspace-1";
const CONVERSATION_ID = "conv-1";

function setup() {
  const conversationSummary = { upsert: jest.fn().mockResolvedValue({}) };
  const conversation = { update: jest.fn().mockResolvedValue({}) };
  const conversationMessage = {
    findMany: jest.fn().mockResolvedValue([
      { role: "USER", content: "My order is late" },
      { role: "ASSISTANT", content: "I'm sorry, let me check that for you" },
    ]),
  };
  const prisma = {
    conversationMessage,
    conversationSummary,
    conversation,
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };

  const chat = jest.fn().mockResolvedValue({
    content: JSON.stringify({
      customerName: "Jane",
      reason: "Late delivery",
      outcome: "Escalated to shipping",
      followUpRecommendation: "Call back tomorrow",
      callbackRequired: true,
      agentPerformance: "Handled professionally",
      ordersDiscussed: ["order-1"],
      problems: ["Late delivery"],
    }),
    model: "gpt-4o-mini",
    promptTokens: 10,
    completionTokens: 10,
    totalTokens: 20,
    rawResponse: {},
  });
  const providerFactory = {
    createForWorkspace: jest.fn().mockResolvedValue({ chat }),
  };

  const sentimentAnalysisService = {
    analyze: jest.fn().mockReturnValue("NEUTRAL"),
  };

  const service = new CallSummaryService(
    prisma as never,
    providerFactory as never,
    sentimentAnalysisService as never,
  );

  return {
    service,
    prisma,
    conversationSummary,
    conversation,
    conversationMessage,
    chat,
    providerFactory,
    sentimentAnalysisService,
  };
}

describe("CallSummaryService", () => {
  it("generates a structured summary from the transcript and upserts it", async () => {
    const { service, conversationSummary, chat } = setup();

    await service.generateAndPersist(CONVERSATION_ID, WORKSPACE_ID);

    expect(chat).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "user",
            content: expect.stringContaining("My order is late"),
          }),
        ]),
      }),
    );
    expect(conversationSummary.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { conversationId: CONVERSATION_ID },
        create: expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          conversationId: CONVERSATION_ID,
          customerName: "Jane",
          reason: "Late delivery",
          callbackRequired: true,
          ordersDiscussed: ["order-1"],
        }),
      }),
    );
  });

  it("persists the heuristic sentiment (not an LLM-derived one) on both rows", async () => {
    const { service, conversationSummary, conversation, sentimentAnalysisService } =
      setup();
    sentimentAnalysisService.analyze.mockReturnValue("NEGATIVE");

    await service.generateAndPersist(CONVERSATION_ID, WORKSPACE_ID);

    expect(conversationSummary.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ sentiment: "NEGATIVE" }),
      }),
    );
    expect(conversation.update).toHaveBeenCalledWith({
      where: { id: CONVERSATION_ID },
      data: { sentiment: "NEGATIVE" },
    });
  });

  it("falls back to an empty summary (never throws) when the model returns invalid JSON", async () => {
    const { service, chat, conversationSummary } = setup();
    chat.mockResolvedValue({
      content: "not valid json",
      model: "gpt-4o-mini",
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      rawResponse: {},
    });

    await expect(
      service.generateAndPersist(CONVERSATION_ID, WORKSPACE_ID),
    ).resolves.toBeUndefined();

    expect(conversationSummary.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ customerName: null, ordersDiscussed: [] }),
      }),
    );
  });

  it("falls back to an empty summary (never throws) when the provider factory fails", async () => {
    const { service, providerFactory, conversationSummary } = setup();
    providerFactory.createForWorkspace.mockRejectedValue(
      new Error("No AI provider configured"),
    );

    await expect(
      service.generateAndPersist(CONVERSATION_ID, WORKSPACE_ID),
    ).resolves.toBeUndefined();

    expect(conversationSummary.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ customerName: null }),
      }),
    );
  });

  it("skips the LLM call entirely for an empty transcript", async () => {
    const { service, conversationMessage, chat } = setup();
    conversationMessage.findMany.mockResolvedValue([]);

    await service.generateAndPersist(CONVERSATION_ID, WORKSPACE_ID);

    expect(chat).not.toHaveBeenCalled();
  });
});
