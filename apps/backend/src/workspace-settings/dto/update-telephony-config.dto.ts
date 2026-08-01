import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MinLength,
} from "class-validator";

import { TelephonyProvider } from "../../generated/prisma/client";

export class UpdateTelephonyConfigDto {
  @IsEnum(TelephonyProvider)
  provider!: TelephonyProvider;

  @IsOptional()
  @IsString()
  authId?: string;

  @IsString()
  @MinLength(1)
  authToken!: string;

  @IsOptional()
  @IsPhoneNumber()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  webhookSecret?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
