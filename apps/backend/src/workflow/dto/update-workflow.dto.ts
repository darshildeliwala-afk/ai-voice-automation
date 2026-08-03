import { IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class UpdateWorkflowDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  aiAgentId?: string;

  @IsOptional()
  @IsString()
  entryNodeKey?: string;
}
