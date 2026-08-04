const mockHandleUpgrade = jest.fn();

jest.mock("ws", () => ({
  WebSocketServer: jest.fn().mockImplementation(() => ({
    handleUpgrade: mockHandleUpgrade,
  })),
}));

// eslint-disable-next-line import/first
import { attachMediaStreamServer } from "./media-stream.bootstrap";
// eslint-disable-next-line import/first
import { MediaStreamGateway } from "./media-stream.gateway";

function setup() {
  const upgradeListeners: Array<(req: unknown, socket: unknown, head: unknown) => void> = [];
  const httpServer = {
    on: jest.fn((event: string, cb: (...args: never[]) => void) => {
      if (event === "upgrade") {
        upgradeListeners.push(cb as never);
      }
    }),
  };
  const gateway = { handleConnection: jest.fn() };
  const app = {
    getHttpServer: jest.fn().mockReturnValue(httpServer),
    get: jest.fn().mockReturnValue(gateway),
  };

  attachMediaStreamServer(app as never);

  const triggerUpgrade = (url: string) => {
    const socket = { destroy: jest.fn() };
    upgradeListeners[0]({ url } as never, socket as never, Buffer.alloc(0) as never);
    return socket;
  };

  return { app, httpServer, gateway, triggerUpgrade };
}

describe("attachMediaStreamServer", () => {
  beforeEach(() => {
    mockHandleUpgrade.mockReset();
  });

  it("resolves MediaStreamGateway from the app and listens for HTTP upgrade events", () => {
    const { app, httpServer } = setup();

    expect(app.get).toHaveBeenCalledWith(MediaStreamGateway);
    expect(httpServer.on).toHaveBeenCalledWith("upgrade", expect.any(Function));
  });

  it("destroys the socket for any path other than /telephony/media-stream", () => {
    const { triggerUpgrade } = setup();

    const socket = triggerUpgrade("/some-other-path");

    expect(socket.destroy).toHaveBeenCalled();
    expect(mockHandleUpgrade).not.toHaveBeenCalled();
  });

  it("hands the connection to MediaStreamGateway, extracting callId from the query string", () => {
    const { triggerUpgrade, gateway } = setup();

    triggerUpgrade("/telephony/media-stream?callId=call-1");

    expect(mockHandleUpgrade).toHaveBeenCalledTimes(1);
    const onUpgrade = mockHandleUpgrade.mock.calls[0][3];
    const fakeWs = { fake: true };
    onUpgrade(fakeWs);

    expect(gateway.handleConnection).toHaveBeenCalledWith(fakeWs, "call-1");
  });

  it("passes null when the upgrade URL carries no callId", () => {
    const { triggerUpgrade, gateway } = setup();

    triggerUpgrade("/telephony/media-stream");
    const onUpgrade = mockHandleUpgrade.mock.calls[0][3];
    const fakeWs = { fake: true };
    onUpgrade(fakeWs);

    expect(gateway.handleConnection).toHaveBeenCalledWith(fakeWs, null);
  });
});
