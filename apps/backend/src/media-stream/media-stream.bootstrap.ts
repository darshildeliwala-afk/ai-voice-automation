import type { INestApplication } from "@nestjs/common";
import type { IncomingMessage } from "http";
import type { Socket } from "net";
import { WebSocketServer } from "ws";

import { MediaStreamGateway } from "./media-stream.gateway";

export const MEDIA_STREAM_PATH = "/telephony/media-stream";

/**
 * Attaches the raw Plivo Media Streams WebSocket server to the Nest
 * app's underlying HTTP server (Sprint 18). Deliberately not
 * `@nestjs/platform-ws`/`@nestjs/websockets` -- neither is installed
 * (only `ws` + `@types/ws`, added standalone in Sprint 17), because
 * Nest's Gateway decorators assume socket.io-style event framing, not
 * Plivo's raw `{event, ...}` JSON frames (see plivo-media-protocol.ts).
 * A hand-rolled `upgrade` handler routed by pathname is the correct fit.
 */
export function attachMediaStreamServer(app: INestApplication): void {
  const httpServer = app.getHttpServer();
  const wss = new WebSocketServer({ noServer: true });
  const gateway = app.get(MediaStreamGateway);

  httpServer.on(
    "upgrade",
    (req: IncomingMessage, socket: Socket, head: Buffer) => {
      const { pathname, searchParams } = new URL(
        req.url ?? "",
        "http://localhost",
      );

      if (pathname !== MEDIA_STREAM_PATH) {
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        gateway.handleConnection(ws, searchParams.get("callId"));
      });
    },
  );
}
