import { IsEnum, IsOptional, IsString, IsUUID } from "class-validator";

import { WorkflowStatus } from "../../generated/prisma/client";
import { PaginationDto } from "../../common/pagination/pagination.dto";

export class ListWorkflowsQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  aiAgentId?: string;

  @IsOptional()
  @IsEnum(WorkflowStatus)
  status?: WorkflowStatus;

  @IsOptional()
  @IsString()
  search?: string;
}
