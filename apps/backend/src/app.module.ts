import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AgentsModule } from "./agents/agents.module";
import { AiAgentModule } from "./ai-agent/ai-agent.module";
import { AuthModule } from "./auth/auth.module";
import { EncryptionModule } from "./common/encryption/encryption.module";
import { PrismaModule } from "./common/prisma/prisma.module";
import { CustomersModule } from "./customers/customers.module";
import { HealthModule } from "./health/health.module";
import { ImportsModule } from "./imports/imports.module";
import { KnowledgeBaseModule } from "./knowledge-base/knowledge-base.module";
import { OrdersModule } from "./orders/orders.module";
import { QueueModule } from "./queue/queue.module";
import { WorkspaceSettingsModule } from "./workspace-settings/workspace-settings.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
    }),
    PrismaModule,
    EncryptionModule,
    AuthModule,
    HealthModule,
    OrdersModule,
    CustomersModule,
    AgentsModule,
    AiAgentModule,
    KnowledgeBaseModule,
    ImportsModule,
    QueueModule,
    WorkspaceSettingsModule,
  ],
})
export class AppModule {}
