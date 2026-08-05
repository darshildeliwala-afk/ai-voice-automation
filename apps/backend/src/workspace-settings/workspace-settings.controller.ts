import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthenticatedUser } from "../auth/jwt.strategy";
import { AiProviderConfigService } from "./ai-provider-config.service";
import { UpdateAiProviderConfigDto } from "./dto/update-ai-provider-config.dto";
import { UpdateSttProviderConfigDto } from "./dto/update-stt-provider-config.dto";
import { UpdateTelephonyConfigDto } from "./dto/update-telephony-config.dto";
import { UpdateTtsProviderConfigDto } from "./dto/update-tts-provider-config.dto";
import { UpdateVoicePersonaConfigDto } from "./dto/update-voice-persona-config.dto";
import { UpdateWorkspaceSettingsDto } from "./dto/update-workspace-settings.dto";
import { SttProviderConfigService } from "./stt-provider-config.service";
import { TelephonyConfigService } from "./telephony-config.service";
import { TtsProviderConfigService } from "./tts-provider-config.service";
import { VoicePersonaConfigService } from "./voice-persona-config.service";
import { WorkspaceSettingsService } from "./workspace-settings.service";

@ApiTags("workspace-settings")
@Controller("workspace-settings")
@UseGuards(JwtAuthGuard)
export class WorkspaceSettingsController {
  constructor(
    private readonly workspaceSettingsService: WorkspaceSettingsService,
    private readonly telephonyConfigService: TelephonyConfigService,
    private readonly aiProviderConfigService: AiProviderConfigService,
    private readonly sttProviderConfigService: SttProviderConfigService,
    private readonly ttsProviderConfigService: TtsProviderConfigService,
    private readonly voicePersonaConfigService: VoicePersonaConfigService,
  ) {}

  @Get()
  getSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.workspaceSettingsService.getSettings(user.workspaceId);
  }

  @Put()
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateWorkspaceSettingsDto,
  ) {
    return this.workspaceSettingsService.updateSettings(
      user.workspaceId,
      dto,
    );
  }

  @Get("telephony")
  getTelephonyConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.telephonyConfigService.getActiveConfig(user.workspaceId);
  }

  @Put("telephony")
  updateTelephonyConfig(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateTelephonyConfigDto,
  ) {
    return this.telephonyConfigService.upsertConfig(user.workspaceId, dto);
  }

  @Get("ai-provider")
  getAiProviderConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.aiProviderConfigService.getActiveConfig(user.workspaceId);
  }

  @Put("ai-provider")
  updateAiProviderConfig(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateAiProviderConfigDto,
  ) {
    return this.aiProviderConfigService.upsertConfig(user.workspaceId, dto);
  }

  @Get("stt-provider")
  getSttProviderConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.sttProviderConfigService.getActiveConfig(user.workspaceId);
  }

  @Put("stt-provider")
  updateSttProviderConfig(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateSttProviderConfigDto,
  ) {
    return this.sttProviderConfigService.upsertConfig(user.workspaceId, dto);
  }

  @Get("tts-provider")
  getTtsProviderConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.ttsProviderConfigService.getActiveConfig(user.workspaceId);
  }

  @Put("tts-provider")
  updateTtsProviderConfig(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateTtsProviderConfigDto,
  ) {
    return this.ttsProviderConfigService.upsertConfig(user.workspaceId, dto);
  }

  @Get("voice-persona")
  getVoicePersonaConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.voicePersonaConfigService.getWorkspaceConfig(user.workspaceId);
  }

  @Put("voice-persona")
  updateVoicePersonaConfig(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateVoicePersonaConfigDto,
  ) {
    return this.voicePersonaConfigService.updateWorkspaceConfig(
      user.workspaceId,
      dto,
    );
  }
}
