import { IsObject, IsUUID } from "class-validator";

export class ValidateImportDto {
  @IsUUID()
  uploadId!: string;

  @IsObject()
  fieldMapping!: Record<string, string>;
}
