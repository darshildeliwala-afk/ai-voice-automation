import { IsEnum, IsISO8601, IsOptional, IsString, Matches } from "class-validator";

import { AppointmentStatus } from "../../generated/prisma/client";

export class UpdateAppointmentDto {
  @IsOptional()
  @IsISO8601()
  date?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: "time must be in 24h HH:mm format",
  })
  time?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;
}
