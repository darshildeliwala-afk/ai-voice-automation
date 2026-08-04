import { Injectable } from "@nestjs/common";

import { PrismaService } from "../common/prisma/prisma.service";
import type {
  AiAgentVoicePersonaOverride,
  VoicePersonaConfig,
} from "../generated/prisma/client";
import { WorkspaceService } from "../workspace/workspace.service";
import { UpdateVoicePersonaConfigDto } from "./dto/update-voice-persona-config.dto";

/** Every field resolved to a concrete value -- what PromptBuilderService and MediaSession actually consume. */
export interface EffectiveVoicePersona {
  tone: VoicePersonaConfig["tone"];
  language: string;
  voiceGender: VoicePersonaConfig["voiceGender"];
  voiceName: string | null;
  indianAccent: boolean;
  speakingRate: number;
  pitch: number;
  warmth: number;
  professionalism: number;
  pauseShortMs: number;
  pauseMediumMs: number;
  pauseLongMs: number;
  fillerWordsEnabled: boolean;
  bargeInEnabled: boolean;
  maxResponseLength: number;
  silenceThresholdMs: number;
  greetingStyle: string | null;
  closingStyle: string | null;
}

/**
 * Two-tier voice/conversation persona (Sprint 18): a workspace-level
 * default (`VoicePersonaConfig`, auto-provisioned with defaults --
 * mirrors WorkspaceSettingsService exactly, not the credential
 * isActive-history pattern used by AiProviderConfig/SttProviderConfig/
 * TtsProviderConfig, since this holds no secrets) plus an optional sparse
 * per-AI-Agent override (`AiAgentVoicePersonaOverride`, every field
 * nullable). resolveEffectiveConfig() is the single merge point every
 * consumer (PromptBuilderService, MediaSession) calls -- field-level
 * inheritance, never a copy of the whole record.
 */
@Injectable()
export class VoicePersonaConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  /** Returns the workspace's default persona, auto-provisioning defaults on first access. */
  async getWorkspaceConfig(workspaceId: string): Promise<VoicePersonaConfig> {
    await this.workspaceService.getWorkspaceById(workspaceId);

    const existing = await this.prisma.voicePersonaConfig.findUnique({
      where: { workspaceId },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.voicePersonaConfig.create({
      data: { workspaceId },
    });
  }

  async updateWorkspaceConfig(
    workspaceId: string,
    dto: UpdateVoicePersonaConfigDto,
  ): Promise<VoicePersonaConfig> {
    await this.workspaceService.getWorkspaceById(workspaceId);

    return this.prisma.voicePersonaConfig.upsert({
      where: { workspaceId },
      create: { workspaceId, ...dto },
      update: dto,
    });
  }

  /** Absence is meaningful here (no override configured) -- unlike the workspace row, this is never auto-provisioned. */
  async getAgentOverride(
    aiAgentId: string,
  ): Promise<AiAgentVoicePersonaOverride | null> {
    return this.prisma.aiAgentVoicePersonaOverride.findUnique({
      where: { aiAgentId },
    });
  }

  async updateAgentOverride(
    aiAgentId: string,
    dto: UpdateVoicePersonaConfigDto,
  ): Promise<AiAgentVoicePersonaOverride> {
    return this.prisma.aiAgentVoicePersonaOverride.upsert({
      where: { aiAgentId },
      create: { aiAgentId, ...dto },
      update: dto,
    });
  }

  /**
   * The one merge point: Agent override field (if set) -> workspace
   * default field. The workspace row's own DB defaults already cover the
   * "system default" tier, so no third lookup is needed.
   */
  async resolveEffectiveConfig(
    workspaceId: string,
    aiAgentId?: string | null,
  ): Promise<EffectiveVoicePersona> {
    const base = await this.getWorkspaceConfig(workspaceId);
    const override = aiAgentId
      ? await this.getAgentOverride(aiAgentId)
      : null;

    return {
      tone: override?.tone ?? base.tone,
      language: override?.language ?? base.language,
      voiceGender: override?.voiceGender ?? base.voiceGender,
      voiceName: override?.voiceName ?? base.voiceName,
      indianAccent: override?.indianAccent ?? base.indianAccent,
      speakingRate: override?.speakingRate ?? base.speakingRate,
      pitch: override?.pitch ?? base.pitch,
      warmth: override?.warmth ?? base.warmth,
      professionalism: override?.professionalism ?? base.professionalism,
      pauseShortMs: override?.pauseShortMs ?? base.pauseShortMs,
      pauseMediumMs: override?.pauseMediumMs ?? base.pauseMediumMs,
      pauseLongMs: override?.pauseLongMs ?? base.pauseLongMs,
      fillerWordsEnabled:
        override?.fillerWordsEnabled ?? base.fillerWordsEnabled,
      bargeInEnabled: override?.bargeInEnabled ?? base.bargeInEnabled,
      maxResponseLength: override?.maxResponseLength ?? base.maxResponseLength,
      silenceThresholdMs:
        override?.silenceThresholdMs ?? base.silenceThresholdMs,
      greetingStyle: override?.greetingStyle ?? base.greetingStyle,
      closingStyle: override?.closingStyle ?? base.closingStyle,
    };
  }
}
