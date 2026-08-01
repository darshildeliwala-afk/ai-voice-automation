import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from "class-validator";

import { AiProvider } from "../../generated/prisma/client";

export class UpdateAiProviderConfigDto {
  @IsEnum(AiProvider)
  provider!: AiProvider;

  @IsString()
  @MinLength(1)
  apiKey!: string;

  @IsOptional()
  @IsString()
  defaultModel?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
