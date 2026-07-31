import { IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class CreateKnowledgeBaseDto {
  @IsUUID()
  workspaceId!: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  content!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
