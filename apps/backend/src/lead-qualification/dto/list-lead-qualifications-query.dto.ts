import { IsEnum, IsOptional, IsUUID } from "class-validator";

import { PaginationDto } from "../../common/pagination/pagination.dto";
import { LeadInterestLevel } from "../../generated/prisma/client";

export class ListLeadQualificationsQueryDto extends PaginationDto {
  @IsUUID()
  workspaceId!: string;

  @IsOptional()
  @IsEnum(LeadInterestLevel)
  interestLevel?: LeadInterestLevel;
}
