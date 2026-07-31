import { IsString, IsUUID, MinLength } from "class-validator";

export class SearchOrdersQueryDto {
  @IsUUID()
  workspaceId!: string;

  @IsString()
  @MinLength(1)
  q!: string;
}
