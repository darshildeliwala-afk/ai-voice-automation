import { Module } from "@nestjs/common";

import { AiAgentModule } from "../ai-agent/ai-agent.module";
import { CustomerModule } from "../customer/customer.module";
import { KnowledgeBaseModule } from "../knowledge-base/knowledge-base.module";
import { OrderModule } from "../order/order.module";
import { WorkspaceSettingsModule } from "../workspace-settings/workspace-settings.module";
import { AIService } from "./ai.service";
import { AIProviderFactory } from "./providers/ai-provider.factory";
import { PromptBuilderService } from "./prompt/prompt-builder.service";

@Module({
  imports: [
    WorkspaceSettingsModule,
    AiAgentModule,
    KnowledgeBaseModule,
    CustomerModule,
    OrderModule,
  ],
  providers: [AIService, AIProviderFactory, PromptBuilderService],
  exports: [AIService, AIProviderFactory, PromptBuilderService],
})
export class AiModule {}
