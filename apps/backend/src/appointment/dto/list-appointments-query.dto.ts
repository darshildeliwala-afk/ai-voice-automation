import { IsEnum, IsOptional, IsUUID } from "class-validator";

import { PaginationDto } from "../../common/pagination/pagination.dto";
import { AppointmentStatus } from "../../generated/prisma/client";

export class ListAppointmentsQueryDto extends PaginationDto {
  @IsUUID()
  workspaceId!: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;
}
