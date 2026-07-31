import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from "class-validator";

export class CreateAiAgentDto {
  @IsUUID()
  workspaceId!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  provider!: string;

  @IsString()
  @MinLength(1)
  model!: string;

  @IsString()
  @MinLength(1)
  voice!: string;

  @IsString()
  @MinLength(1)
  language!: string;

  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @IsOptional()
  @IsString()
  greeting?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
