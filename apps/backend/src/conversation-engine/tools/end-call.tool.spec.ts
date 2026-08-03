import { EndCallTool } from "./end-call.tool";

const CONTEXT = {
  workspaceId: "workspace-1",
  customerId: "customer-1",
  conversationId: "conv-1",
};

describe("EndCallTool", () => {
  it("marks the conversation COMPLETED and returns a terminal result", async () => {
    const prisma = { conversation: { update: jest.fn().mockResolvedValue({}) } };
    const tool = new EndCallTool(prisma as never);

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
    const prisma = { conversation: { update: jest.fn().mockResolvedValue({}) } };
    const tool = new EndCallTool(prisma as never);

    const result = await tool.execute({}, CONTEXT);

    expect(JSON.parse(result.content).reason).toBeDefined();
  });
});
