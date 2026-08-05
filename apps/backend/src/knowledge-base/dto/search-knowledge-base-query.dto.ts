import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from "class-validator";

export class SearchKnowledgeBaseQueryDto {
  @ApiProperty()
  @IsUUID()
  workspaceId!: string;

  @ApiProperty({ description: "Free-text search query" })
  @IsString()
  @MinLength(1)
  query!: string;

  @ApiPropertyOptional({ description: "Max number of results", example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
