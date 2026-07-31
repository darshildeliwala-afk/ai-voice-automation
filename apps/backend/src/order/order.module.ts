import { Module } from "@nestjs/common";

import { CustomerModule } from "../customer/customer.module";
import { OrderService } from "./order.service";

@Module({
  imports: [CustomerModule],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
