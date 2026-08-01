import { StructuredLogger } from "./structured-logger";

describe("StructuredLogger", () => {
  it("writes info-level JSON lines to stdout for event()", () => {
    const logger = new StructuredLogger();
    const spy = jest
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    logger.event("TestContext", "hello", { foo: "bar" });

    expect(spy).toHaveBeenCalledTimes(1);
    const written = JSON.parse((spy.mock.calls[0][0] as string).trim());
    expect(written).toMatchObject({
      level: "info",
      context: "TestContext",
      message: "hello",
      foo: "bar",
    });
    expect(typeof written.timestamp).toBe("string");

    spy.mockRestore();
  });

  it("writes error-level JSON lines to stderr for eventError() and serializes Error objects", () => {
    const logger = new StructuredLogger();
    const spy = jest
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    logger.eventError("TestContext", "failed", new Error("boom"), {
      jobId: "1",
    });

    const written = JSON.parse((spy.mock.calls[0][0] as string).trim());
    expect(written.level).toBe("error");
    expect(written.error.message).toBe("boom");
    expect(written.jobId).toBe("1");

    spy.mockRestore();
  });

  it("implements Nest's LoggerService signature for log/error/warn/debug/verbose", () => {
    const logger = new StructuredLogger();
    const spy = jest
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    logger.log("plain message", "SomeContext");

    const written = JSON.parse((spy.mock.calls[0][0] as string).trim());
    expect(written).toMatchObject({
      level: "info",
      context: "SomeContext",
      message: "plain message",
    });

    spy.mockRestore();
  });
});
