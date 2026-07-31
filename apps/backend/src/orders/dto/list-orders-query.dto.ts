import { IsUUID } from "class-validator";

import { PaginationDto } from "../../common/pagination/pagination.dto";

export class ListOrdersQueryDto extends PaginationDto {
  @IsUUID()
  workspaceId!: string;
}
