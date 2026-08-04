import { Module } from "@nestjs/common";

import { AiModule } from "../ai/ai.module";
import { CallQueueModule } from "../call-queue/call-queue.module";
import { ConversationEngineModule } from "../conversation-engine/conversation-engine.module";
import { WorkspaceSettingsModule } from "../workspace-settings/workspace-settings.module";
import { MEDIA_SESSION_CONFIG, loadMediaSessionConfig } from "./media-session.config";
import { MediaStreamGateway } from "./media-stream.gateway";

@Module({
  imports: [AiModule, ConversationEngineModule, CallQueueModule, WorkspaceSettingsModule],
  providers: [
    MediaStreamGateway,
    { provide: MEDIA_SESSION_CONFIG, useFactory: loadMediaSessionConfig },
  ],
  exports: [MediaStreamGateway],
})
export class MediaStreamModule {}
