import { Type } from "class-transformer";
import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from "class-validator";

import { CreateWorkflowNodeDto } from "./create-workflow-node.dto";

export class CreateWorkflowDto {
  @IsOptional()
  @IsUUID()
  aiAgentId?: string;

  @IsString()
  @MinLength(1)
  slug!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  entryNodeKey?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateWorkflowNodeDto)
  nodes?: CreateWorkflowNodeDto[];
}
