import { WorkerIdentityService } from "./worker-identity.service";

describe("WorkerIdentityService", () => {
  it("generates a workerId containing the process pid", () => {
    const service = new WorkerIdentityService();
    expect(service.workerId).toContain(String(process.pid));
    expect(service.workerId.split(":")).toHaveLength(3);
  });

  it("generates a different id per instance", () => {
    const a = new WorkerIdentityService();
    const b = new WorkerIdentityService();
    expect(a.workerId).not.toBe(b.workerId);
  });
});
