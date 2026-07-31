import { Module } from "@nestjs/common";

import { OrderModule } from "../order/order.module";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
  imports: [OrderModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
