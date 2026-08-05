import { IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class CreateCrmNoteDto {
  @IsUUID()
  workspaceId!: string;

  @IsUUID()
  customerId!: string;

  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsString()
  @MinLength(1)
  content!: string;
}
