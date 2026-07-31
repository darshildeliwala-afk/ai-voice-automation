import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AgentsModule } from "./agents/agents.module";
import { AiAgentModule } from "./ai-agent/ai-agent.module";
import { AuthModule } from "./auth/auth.module";
import { PrismaModule } from "./common/prisma/prisma.module";
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
    PrismaModule,
    AuthModule,
    HealthModule,
    OrdersModule,
    CustomersModule,
    AgentsModule,
    AiAgentModule,
    QueueModule,
  ],
})
export class AppModule {}
