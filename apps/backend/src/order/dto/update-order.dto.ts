import { Type } from "class-transformer";
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  ValidateNested,
} from "class-validator";

import {
  Marketplace,
  OrderStatus,
  PaymentType,
  type Prisma,
} from "../../generated/prisma/client";
import { OrderItemDto } from "./order-item.dto";

export class UpdateOrderDto {
  @IsOptional()
  @IsEnum(Marketplace)
  marketplace?: Marketplace;

  @IsOptional()
  @IsString()
  marketplaceOrderId?: string;

  @IsOptional()
  @IsEnum(PaymentType)
  paymentType?: PaymentType;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  totalAmount?: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsObject()
  shippingAddress?: Prisma.InputJsonValue;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsObject()
  metadata?: Prisma.InputJsonValue;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items?: OrderItemDto[];
}
