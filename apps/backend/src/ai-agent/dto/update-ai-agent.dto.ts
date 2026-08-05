import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from "class-validator";

import { AiAgentStatus } from "../../generated/prisma/client";

export class UpdateAiAgentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ description: "Free-text description of the agent's purpose" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: "Knowledge base this agent draws answers from" })
  @IsOptional()
  @IsUUID()
  knowledgeBaseId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  provider?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  model?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  voice?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  language?: string;

  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @IsOptional()
  @IsString()
  greeting?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @ApiPropertyOptional({ description: "Maximum tokens the model may generate per turn", example: 512 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxTokens?: number;

  @ApiPropertyOptional({ description: "Business goal this agent is optimizing for" })
  @IsOptional()
  @IsString()
  businessGoal?: string;

  @ApiPropertyOptional({ enum: AiAgentStatus, description: "Admin-facing lifecycle status" })
  @IsOptional()
  @IsEnum(AiAgentStatus)
  status?: AiAgentStatus;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
