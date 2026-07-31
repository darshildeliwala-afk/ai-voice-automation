import { IsOptional, IsString, IsUUID } from "class-validator";

import { PaginationDto } from "../../common/pagination/pagination.dto";

export class ListKnowledgeBasesQueryDto extends PaginationDto {
  @IsUUID()
  workspaceId!: string;

  @IsOptional()
  @IsString()
  search?: string;
}
