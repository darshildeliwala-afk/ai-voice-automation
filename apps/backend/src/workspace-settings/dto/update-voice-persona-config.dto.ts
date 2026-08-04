import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

import { VoiceGender, VoicePersonaTone } from "../../generated/prisma/client";

/**
 * Shared by both the workspace-level default persona route and the
 * per-AI-Agent override route (Sprint 18) -- every field is optional in
 * both cases, which is correct partial-update semantics for the sparse
 * override table too (an agent may set just one field).
 */
export class UpdateVoicePersonaConfigDto {
  @IsOptional()
  @IsEnum(VoicePersonaTone)
  tone?: VoicePersonaTone;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsEnum(VoiceGender)
  voiceGender?: VoiceGender;

  @IsOptional()
  @IsString()
  voiceName?: string;

  @IsOptional()
  @IsBoolean()
  indianAccent?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(2.0)
  speakingRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(-1)
  @Max(1)
  pitch?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  warmth?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  professionalism?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  pauseShortMs?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  pauseMediumMs?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  pauseLongMs?: number;

  @IsOptional()
  @IsBoolean()
  fillerWordsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  bargeInEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxResponseLength?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  silenceThresholdMs?: number;

  @IsOptional()
  @IsString()
  greetingStyle?: string;

  @IsOptional()
  @IsString()
  closingStyle?: string;
}
