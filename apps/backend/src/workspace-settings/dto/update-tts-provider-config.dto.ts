import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from "class-validator";

import { TtsProvider } from "../../generated/prisma/client";

export class UpdateTtsProviderConfigDto {
  @IsEnum(TtsProvider)
  provider!: TtsProvider;

  @IsString()
  @MinLength(1)
  apiKey!: string;

  @IsOptional()
  @IsString()
  voice?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
