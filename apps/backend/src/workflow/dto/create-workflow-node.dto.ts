import { IsEnum, IsObject, IsString, MinLength } from "class-validator";

import { WorkflowNodeType } from "../../generated/prisma/client";

export class CreateWorkflowNodeDto {
  @IsString()
  @MinLength(1)
  key!: string;

  @IsEnum(WorkflowNodeType)
  type!: WorkflowNodeType;

  @IsObject()
  config!: Record<string, unknown>;
}
