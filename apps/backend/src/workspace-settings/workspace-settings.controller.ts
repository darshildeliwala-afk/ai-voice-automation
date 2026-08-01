import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthenticatedUser } from "../auth/jwt.strategy";
import { AiProviderConfigService } from "./ai-provider-config.service";
import { UpdateAiProviderConfigDto } from "./dto/update-ai-provider-config.dto";
import { UpdateTelephonyConfigDto } from "./dto/update-telephony-config.dto";
import { UpdateWorkspaceSettingsDto } from "./dto/update-workspace-settings.dto";
import { TelephonyConfigService } from "./telephony-config.service";
import { WorkspaceSettingsService } from "./workspace-settings.service";

@Controller("workspace-settings")
@UseGuards(JwtAuthGuard)
export class WorkspaceSettingsController {
  constructor(
    private readonly workspaceSettingsService: WorkspaceSettingsService,
    private readonly telephonyConfigService: TelephonyConfigService,
    private readonly aiProviderConfigService: AiProviderConfigService,
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
}
