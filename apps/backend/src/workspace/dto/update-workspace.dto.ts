import { IsObject, IsOptional, IsString, MinLength } from "class-validator";

import type { Prisma } from "../../generated/prisma/client";

export class UpdateWorkspaceDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  slug?: string;

  @IsOptional()
  @IsObject()
  metadata?: Prisma.InputJsonValue;
}
