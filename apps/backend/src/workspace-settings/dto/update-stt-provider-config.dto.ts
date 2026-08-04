import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from "class-validator";

import { SttProvider } from "../../generated/prisma/client";

export class UpdateSttProviderConfigDto {
  @IsEnum(SttProvider)
  provider!: SttProvider;

  @IsString()
  @MinLength(1)
  apiKey!: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
