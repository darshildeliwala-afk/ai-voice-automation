import { IsUUID } from "class-validator";

export class EnqueueCallDto {
  @IsUUID()
  orderId!: string;
}
