import { IsObject, IsOptional, IsString, MinLength } from "class-validator";

import type { Prisma } from "../../generated/prisma/client";

export class CreateWorkspaceDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  slug!: string;

  @IsOptional()
  @IsObject()
  metadata?: Prisma.InputJsonValue;
}
