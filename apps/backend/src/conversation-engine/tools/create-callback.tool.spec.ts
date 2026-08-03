import { CreateCallbackTool } from "./create-callback.tool";

const CONTEXT = {
  workspaceId: "workspace-1",
  customerId: "customer-1",
  conversationId: "conv-1",
  orderId: "order-1",
};

function futureIso(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
}

describe("CreateCallbackTool", () => {
  it("schedules a callback via CallQueueService.enqueue with the given time", async () => {
    const callQueueService = {
      enqueue: jest.fn().mockResolvedValue({
        id: "queue-1",
        scheduledAt: new Date("2026-08-04T15:00:00Z"),
      }),
    };
    const tool = new CreateCallbackTool(callQueueService as never);
    const scheduledAt = futureIso(2);

    const result = await tool.execute({ scheduledAt }, CONTEXT);

    expect(callQueueService.enqueue).toHaveBeenCalledWith(
      "order-1",
      new Date(scheduledAt),
    );
    expect(JSON.parse(result.content).scheduled).toBe(true);
  });

  it("returns a graceful error when the conversation has no bound order", async () => {
    const callQueueService = { enqueue: jest.fn() };
    const tool = new CreateCallbackTool(callQueueService as never);

    const result = await tool.execute(
      { scheduledAt: futureIso(1) },
      { ...CONTEXT, orderId: undefined },
    );

    expect(JSON.parse(result.content).error).toBeDefined();
    expect(callQueueService.enqueue).not.toHaveBeenCalled();
  });

  it("returns a graceful error when scheduledAt is not a valid date", async () => {
    const callQueueService = { enqueue: jest.fn() };
    const tool = new CreateCallbackTool(callQueueService as never);

    const result = await tool.execute(
      { scheduledAt: "not-a-date" },
      CONTEXT,
    );

    expect(JSON.parse(result.content).error).toBeDefined();
    expect(callQueueService.enqueue).not.toHaveBeenCalled();
  });

  it("returns a graceful error when scheduledAt is in the past", async () => {
    const callQueueService = { enqueue: jest.fn() };
    const tool = new CreateCallbackTool(callQueueService as never);

    const result = await tool.execute(
      { scheduledAt: new Date(Date.now() - 60_000).toISOString() },
      CONTEXT,
    );

    expect(JSON.parse(result.content).error).toContain("future");
    expect(callQueueService.enqueue).not.toHaveBeenCalled();
  });
});
