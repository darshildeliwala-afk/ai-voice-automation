import { Module } from "@nestjs/common";

import { AiModule } from "../ai/ai.module";
import { AiAgentModule } from "../ai-agent/ai-agent.module";
import { CustomerModule } from "../customer/customer.module";
import { OrderModule } from "../order/order.module";
import { WorkflowModule } from "../workflow/workflow.module";
import { WorkspaceSettingsModule } from "../workspace-settings/workspace-settings.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { ConversationEngineService } from "./conversation-engine.service";

@Module({
  imports: [
    AiModule,
    WorkspaceModule,
    WorkspaceSettingsModule,
    CustomerModule,
    OrderModule,
    AiAgentModule,
    WorkflowModule,
  ],
  providers: [ConversationEngineService],
  exports: [ConversationEngineService],
})
export class ConversationEngineModule {}
