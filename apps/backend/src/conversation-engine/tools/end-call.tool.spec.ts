import { EndCallTool } from "./end-call.tool";

const CONTEXT = {
  workspaceId: "workspace-1",
  customerId: "customer-1",
  conversationId: "conv-1",
};

function setup() {
  const prisma = { conversation: { update: jest.fn().mockResolvedValue({}) } };
  const callSummaryService = {
    generateAndPersist: jest.fn().mockResolvedValue(undefined),
  };
  const tool = new EndCallTool(prisma as never, callSummaryService as never);

  return { tool, prisma, callSummaryService };
}

describe("EndCallTool", () => {
  it("marks the conversation COMPLETED and returns a terminal result", async () => {
    const { tool, prisma } = setup();

    const result = await tool.execute({ reason: "issue resolved" }, CONTEXT);

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: "conv-1" },
      data: { status: "COMPLETED" },
    });
    expect(result.terminal).toBe(true);
    expect(JSON.parse(result.content)).toEqual({
      ended: true,
      reason: "issue resolved",
    });
  });

  it("uses a default reason when none is given", async () => {
    const { tool } = setup();

    const result = await tool.execute({}, CONTEXT);

    expect(JSON.parse(result.content).reason).toBeDefined();
  });

  it("triggers call summary generation for the conversation (Sprint 19)", async () => {
    const { tool, callSummaryService } = setup();

    await tool.execute({}, CONTEXT);

    expect(callSummaryService.generateAndPersist).toHaveBeenCalledWith(
      "conv-1",
      "workspace-1",
    );
  });

  it("still returns a terminal result and completes the conversation update even when summary generation fails", async () => {
    const { tool, prisma, callSummaryService } = setup();
    callSummaryService.generateAndPersist.mockRejectedValue(
      new Error("provider down"),
    );

    const result = await tool.execute({ reason: "issue resolved" }, CONTEXT);

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: "conv-1" },
      data: { status: "COMPLETED" },
    });
    expect(result.terminal).toBe(true);
    expect(JSON.parse(result.content)).toEqual({
      ended: true,
      reason: "issue resolved",
    });
  });
});
