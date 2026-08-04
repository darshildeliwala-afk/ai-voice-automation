import { MediaStreamGateway } from "./media-stream.gateway";

function setup() {
  const prisma = {};
  const sttProviderFactory = {};
  const ttsProviderFactory = {};
  const conversationEngine = {};
  const callQueueService = {};
  const voicePersonaConfigService = {};
  const mediaSessionConfig = { silenceTimeoutMs: 2000, aiResponseTimeoutMs: 15000 };

  const gateway = new MediaStreamGateway(
    prisma as never,
    sttProviderFactory as never,
    ttsProviderFactory as never,
    conversationEngine as never,
    callQueueService as never,
    voicePersonaConfigService as never,
    mediaSessionConfig,
  );

  return { gateway };
}

function fakeWs() {
  const listeners: Record<string, (...args: never[]) => void> = {};
  return {
    close: jest.fn(),
    on: jest.fn((event: string, cb: (...args: never[]) => void) => {
      listeners[event] = cb;
    }),
    send: jest.fn(),
    listeners,
  };
}

describe("MediaStreamGateway", () => {
  it("closes the connection with code 1008 when no callId is present", () => {
    const { gateway } = setup();
    const ws = fakeWs();

    gateway.handleConnection(ws as never, null);

    expect(ws.close).toHaveBeenCalledWith(1008, "callId required");
    expect(ws.on).not.toHaveBeenCalled();
  });

  it("creates a session and registers message/close/error listeners when callId is present", () => {
    const { gateway } = setup();
    const ws = fakeWs();

    gateway.handleConnection(ws as never, "call-1");

    expect(ws.close).not.toHaveBeenCalled();
    expect(ws.on).toHaveBeenCalledWith("message", expect.any(Function));
    expect(ws.on).toHaveBeenCalledWith("close", expect.any(Function));
    expect(ws.on).toHaveBeenCalledWith("error", expect.any(Function));
  });
});
