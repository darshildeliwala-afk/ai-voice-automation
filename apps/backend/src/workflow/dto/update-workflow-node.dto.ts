import { IsObject } from "class-validator";

export class UpdateWorkflowNodeDto {
  @IsObject()
  config!: Record<string, unknown>;
}
