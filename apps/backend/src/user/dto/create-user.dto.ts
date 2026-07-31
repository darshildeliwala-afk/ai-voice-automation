import { IsEmail, IsString, IsUUID, MinLength } from "class-validator";

export class CreateUserDto {
  @IsUUID()
  workspaceId!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsEmail()
  email!: string;
}
