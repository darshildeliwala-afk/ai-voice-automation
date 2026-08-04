import { Module } from "@nestjs/common";

import { EncryptionModule } from "../common/encryption/encryption.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { AiProviderConfigService } from "./ai-provider-config.service";
import { SttProviderConfigService } from "./stt-provider-config.service";
import { TelephonyConfigService } from "./telephony-config.service";
import { TtsProviderConfigService } from "./tts-provider-config.service";
import { WorkspaceSettingsController } from "./workspace-settings.controller";
import { WorkspaceSettingsService } from "./workspace-settings.service";

@Module({
  imports: [WorkspaceModule, EncryptionModule],
  controllers: [WorkspaceSettingsController],
  providers: [
    WorkspaceSettingsService,
    TelephonyConfigService,
    AiProviderConfigService,
    SttProviderConfigService,
    TtsProviderConfigService,
  ],
  exports: [
    WorkspaceSettingsService,
    TelephonyConfigService,
    AiProviderConfigService,
    SttProviderConfigService,
    TtsProviderConfigService,
  ],
})
export class WorkspaceSettingsModule {}
