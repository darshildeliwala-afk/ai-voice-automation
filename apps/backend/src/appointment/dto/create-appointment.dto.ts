import { IsISO8601, IsOptional, IsString, IsUUID, Matches } from "class-validator";

export class CreateAppointmentDto {
  @IsUUID()
  workspaceId!: string;

  @IsUUID()
  customerId!: string;

  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsISO8601()
  date!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: "time must be in 24h HH:mm format",
  })
  time!: string;

  @IsString()
  timezone!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
