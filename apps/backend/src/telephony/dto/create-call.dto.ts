import { IsOptional, IsUUID } from "class-validator";

export class CreateCallDto {
  @IsUUID()
  queueId!: string;

  @IsUUID()
  customerId!: string;

  @IsOptional()
  @IsUUID()
  aiAgentId?: string;
}
