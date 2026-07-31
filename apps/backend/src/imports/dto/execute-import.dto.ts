import { IsUUID } from "class-validator";

export class ExecuteImportDto {
  @IsUUID()
  uploadId!: string;
}
