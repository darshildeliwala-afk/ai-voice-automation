import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsUUID } from "class-validator";

import { PaginationDto } from "../../common/pagination/pagination.dto";

export class ListConversationsQueryDto extends PaginationDto {
  @ApiProperty()
  @IsUUID()
  workspaceId!: string;

  @ApiPropertyOptional({ description: "Filter to a single customer" })
  @IsOptional()
  @IsUUID()
  customerId?: string;
}
