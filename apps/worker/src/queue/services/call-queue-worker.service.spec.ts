import { StructuredLogger } from "../../common/logger/structured-logger";
import type { WorkerIdentityService } from "../../common/worker-identity/worker-identity.service";
import { CallQueueWorkerService } from "./call-queue-worker.service";

function setup() {
  const repository = {
    claim: jest.fn(),
    complete: jest.fn(),
    requeue: jest.fn(),
    fail: jest.fn(),
    findDue: jest.fn(),
    findById: jest.fn(),
    recoverStaleLocks: jest.fn(),
    getStatusCounts: jest.fn(),
  };
  const provider = { process: jest.fn() };
  const workerIdentity = { workerId: "worker-1" } as WorkerIdentityService;
  const logger = new StructuredLogger();
  jest.spyOn(logger, "event").mockImplementation(() => undefined);
  jest.spyOn(logger, "eventError").mockImplementation(() => undefined);

  const service = new CallQueueWorkerService(
    repository as never,
    provider as never,
    workerIdentity,
    logger,
  );

  return { service, repository, provider };
}

describe("CallQueueWorkerService", () => {
  it("returns already-claimed when the row could not be claimed", async () => {
    const { service, repository, provider } = setup();
    repository.claim.mockResolvedValue(null);

    const outcome = await service.processCallQueueId("row-1");

    expect(outcome).toEqual({
      type: "already-claimed",
      callQueueId: "row-1",
    });
    expect(provider.process).not.toHaveBeenCalled();
  });

  it("completes the row when processing succeeds", async () => {
    const { service, repository, provider } = setup();
    repository.claim.mockResolvedValue({
      id: "row-1",
      orderId: "order-1",
      attemptCount: 0,
    });
    provider.process.mockResolvedValue({ success: true });

    const outcome = await service.processCallQueueId("row-1");

    expect(outcome).toEqual({ type: "completed", callQueueId: "row-1" });
    expect(repository.complete).toHaveBeenCalledWith("row-1");
  });

  it("requeues when processing fails and attempts remain", async () => {
    const { service, repository, provider } = setup();
    repository.claim.mockResolvedValue({
      id: "row-1",
      orderId: "order-1",
      attemptCount: 0,
    });
    provider.process.mockRejectedValue(new Error("boom"));

    const outcome = await service.processCallQueueId("row-1");

    expect(outcome).toEqual({
      type: "requeued",
      callQueueId: "row-1",
      error: "boom",
      attempt: 1,
    });
    expect(repository.requeue).toHaveBeenCalledWith("row-1", "boom");
    expect(repository.fail).not.toHaveBeenCalled();
  });

  it("fails permanently once attempts are exhausted (default QUEUE_MAX_ATTEMPTS=3)", async () => {
    const { service, repository, provider } = setup();
    repository.claim.mockResolvedValue({
      id: "row-1",
      orderId: "order-1",
      attemptCount: 2,
    });
    provider.process.mockRejectedValue(new Error("boom"));

    const outcome = await service.processCallQueueId("row-1");

    expect(outcome).toEqual({
      type: "failed",
      callQueueId: "row-1",
      error: "boom",
      attempt: 3,
    });
    expect(repository.fail).toHaveBeenCalledWith("row-1", "boom");
    expect(repository.requeue).not.toHaveBeenCalled();
  });

  it("treats a provider result of success:false as a processing failure", async () => {
    const { service, repository, provider } = setup();
    repository.claim.mockResolvedValue({
      id: "row-1",
      orderId: "order-1",
      attemptCount: 0,
    });
    provider.process.mockResolvedValue({
      success: false,
      message: "declined",
    });

    const outcome = await service.processCallQueueId("row-1");

    expect(outcome.type).toBe("requeued");
    expect(repository.requeue).toHaveBeenCalledWith("row-1", "declined");
  });
});
