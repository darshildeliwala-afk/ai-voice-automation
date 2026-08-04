import { SilenceDetector } from "./silence-detector";

describe("SilenceDetector", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("fires onTimeout after timeoutMs of no activity", () => {
    const onTimeout = jest.fn();
    const detector = new SilenceDetector(1000, onTimeout);

    detector.recordActivity();
    jest.advanceTimersByTime(999);
    expect(onTimeout).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("resets the timer on each recordActivity() call", () => {
    const onTimeout = jest.fn();
    const detector = new SilenceDetector(1000, onTimeout);

    detector.recordActivity();
    jest.advanceTimersByTime(700);
    detector.recordActivity();
    jest.advanceTimersByTime(700);
    expect(onTimeout).not.toHaveBeenCalled();

    jest.advanceTimersByTime(300);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("stop() cancels a pending timeout", () => {
    const onTimeout = jest.fn();
    const detector = new SilenceDetector(1000, onTimeout);

    detector.recordActivity();
    detector.stop();
    jest.advanceTimersByTime(2000);

    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("does not fire again after already firing once, until recordActivity() is called again", () => {
    const onTimeout = jest.fn();
    const detector = new SilenceDetector(1000, onTimeout);

    detector.recordActivity();
    jest.advanceTimersByTime(1000);
    expect(onTimeout).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(5000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });
});
