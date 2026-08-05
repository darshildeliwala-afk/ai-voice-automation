import { TransferToHumanTool } from "./transfer-to-human.tool";

const CONTEXT = {
  workspaceId: "workspace-1",
  customerId: "customer-1",
  conversationId: "conv-1",
};

function setup() {
  const prisma = {
    humanTransferEvent: { create: jest.fn().mockResolvedValue({}) },
    conversation: { update: jest.fn().mockResolvedValue({}) },
  };
  const tool = new TransferToHumanTool(prisma as never);

  return { tool, prisma };
}

describe("TransferToHumanTool", () => {
  it("returns a terminal result recording the transfer request", async () => {
    const { tool } = setup();

    const result = await tool.execute(
      { reason: "customer requested a manager" },
      CONTEXT,
    );

    expect(result.terminal).toBe(true);
    expect(JSON.parse(result.content)).toMatchObject({
      transferRequested: true,
      reason: "customer requested a manager",
    });
  });

  it("creates a HumanTransferEvent and marks the conversation WAITING_FOR_HUMAN (Sprint 19)", async () => {
    const { tool, prisma } = setup();

    await tool.execute({ reason: "customer requested a manager" }, CONTEXT);

    expect(prisma.humanTransferEvent.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace-1",
        conversationId: "conv-1",
        reason: "customer requested a manager",
      },
    });
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: "conv-1" },
      data: { status: "WAITING_FOR_HUMAN" },
    });
  });

  it("uses a default reason when none is given", async () => {
    const { tool, prisma } = setup();

    await tool.execute({}, CONTEXT);

    expect(prisma.humanTransferEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reason: "Not specified" }) }),
    );
  });
});
