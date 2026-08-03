import { TransferToHumanTool } from "./transfer-to-human.tool";

const CONTEXT = {
  workspaceId: "workspace-1",
  customerId: "customer-1",
  conversationId: "conv-1",
};

describe("TransferToHumanTool", () => {
  it("returns a terminal result recording the transfer request", async () => {
    const tool = new TransferToHumanTool();

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

  it("does not throw and does not touch the database (no real transfer capability yet)", async () => {
    const tool = new TransferToHumanTool();

    await expect(tool.execute({}, CONTEXT)).resolves.toBeDefined();
  });
});
