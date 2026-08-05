import { IsString, MinLength } from "class-validator";

export class UpdateCrmNoteDto {
  @IsString()
  @MinLength(1)
  content!: string;
}
