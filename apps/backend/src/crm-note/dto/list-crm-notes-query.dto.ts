import { IsOptional, IsUUID } from "class-validator";

import { PaginationDto } from "../../common/pagination/pagination.dto";

export class ListCrmNotesQueryDto extends PaginationDto {
  @IsUUID()
  workspaceId!: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;
}
