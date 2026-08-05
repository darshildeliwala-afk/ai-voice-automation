import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from "class-validator";

import { PaginationDto } from "../../common/pagination/pagination.dto";
import { CallDirection, CallStatus } from "../../generated/prisma/client";

export class ListCallsQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: CallStatus })
  @IsOptional()
  @IsEnum(CallStatus)
  status?: CallStatus;

  @ApiPropertyOptional({ enum: CallDirection })
  @IsOptional()
  @IsEnum(CallDirection)
  direction?: CallDirection;

  @ApiPropertyOptional({ description: "Filter to a single customer" })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ description: "ISO date, inclusive lower bound on startedAt" })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: "ISO date, inclusive upper bound on startedAt" })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  /** Matches against phoneNumber (contains, case-insensitive). */
  @ApiPropertyOptional({ description: "Case-insensitive phone number search" })
  @IsOptional()
  @IsString()
  search?: string;
}
