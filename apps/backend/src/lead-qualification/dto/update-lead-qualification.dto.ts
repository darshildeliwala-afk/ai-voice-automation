import { IsEmail, IsEnum, IsOptional, IsString } from "class-validator";

import { LeadInterestLevel } from "../../generated/prisma/client";

export class UpdateLeadQualificationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsString()
  budget?: string;

  @IsOptional()
  @IsString()
  requirement?: string;

  @IsOptional()
  @IsString()
  timeline?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(LeadInterestLevel)
  interestLevel?: LeadInterestLevel;
}
