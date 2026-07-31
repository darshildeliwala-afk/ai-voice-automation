import { IsUUID } from "class-validator";

export class UploadImportDto {
  @IsUUID()
  workspaceId!: string;
}
