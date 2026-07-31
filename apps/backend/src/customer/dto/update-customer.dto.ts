import { IsEmail, IsObject, IsOptional, IsString, MinLength } from "class-validator";

import type { Prisma } from "../../generated/prisma/client";

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsObject()
  metadata?: Prisma.InputJsonValue;
}
