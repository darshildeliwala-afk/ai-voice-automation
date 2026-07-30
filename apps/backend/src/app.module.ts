import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AgentsModule } from "./agents/agents.module";
import { CustomersModule } from "./customers/customers.module";
import { HealthModule } from "./health/health.module";
import { OrdersModule } from "./orders/orders.module";
import { QueueModule } from "./queue/queue.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
    }),
    HealthModule,
    OrdersModule,
    CustomersModule,
    AgentsModule,
    QueueModule,
  ],
})
export class AppModule {}
