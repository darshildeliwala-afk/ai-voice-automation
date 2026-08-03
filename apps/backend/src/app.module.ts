import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AgentsModule } from "./agents/agents.module";
import { AiModule } from "./ai/ai.module";
import { AiAgentModule } from "./ai-agent/ai-agent.module";
import { AuthModule } from "./auth/auth.module";
import { EncryptionModule } from "./common/encryption/encryption.module";
import { PrismaModule } from "./common/prisma/prisma.module";
import { ConversationEngineModule } from "./conversation-engine/conversation-engine.module";
import { CustomerModule } from "./customer/customer.module";
import { HealthModule } from "./health/health.module";
import { ImportsModule } from "./imports/imports.module";
import { KnowledgeBaseModule } from "./knowledge-base/knowledge-base.module";
import { OrdersModule } from "./orders/orders.module";
import { QueueModule } from "./queue/queue.module";
import { TelephonyModule } from "./telephony/telephony.module";
import { WorkflowModule } from "./workflow/workflow.module";
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
    CustomerModule,
    AgentsModule,
    AiAgentModule,
    KnowledgeBaseModule,
    ImportsModule,
    QueueModule,
    WorkspaceSettingsModule,
    TelephonyModule,
    AiModule,
    WorkflowModule,
    ConversationEngineModule,
  ],
})
export class AppModule {}
