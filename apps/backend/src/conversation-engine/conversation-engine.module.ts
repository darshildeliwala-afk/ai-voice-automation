import { Module } from "@nestjs/common";

import { AiModule } from "../ai/ai.module";
import { AiAgentModule } from "../ai-agent/ai-agent.module";
import { CallQueueModule } from "../call-queue/call-queue.module";
import { CustomerModule } from "../customer/customer.module";
import { KnowledgeBaseModule } from "../knowledge-base/knowledge-base.module";
import { OrderModule } from "../order/order.module";
import { WorkspaceSettingsModule } from "../workspace-settings/workspace-settings.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { ConversationEngineService } from "./conversation-engine.service";
import { AIToolExecutor } from "./tools/ai-tool-executor";
import { AI_TOOLS, AIToolRegistry } from "./tools/ai-tool-registry";
import { CreateCallbackTool } from "./tools/create-callback.tool";
import { EndCallTool } from "./tools/end-call.tool";
import { LookupCustomerTool } from "./tools/lookup-customer.tool";
import { LookupOrderTool } from "./tools/lookup-order.tool";
import { SearchKnowledgeBaseTool } from "./tools/search-knowledge-base.tool";
import { TransferToHumanTool } from "./tools/transfer-to-human.tool";

@Module({
  imports: [
    AiModule,
    WorkspaceModule,
    WorkspaceSettingsModule,
    CustomerModule,
    OrderModule,
    AiAgentModule,
    KnowledgeBaseModule,
    CallQueueModule,
  ],
  providers: [
    ConversationEngineService,
    AIToolRegistry,
    AIToolExecutor,
    LookupCustomerTool,
    LookupOrderTool,
    SearchKnowledgeBaseTool,
    EndCallTool,
    TransferToHumanTool,
    CreateCallbackTool,
    {
      provide: AI_TOOLS,
      useFactory: (
        lookupCustomer: LookupCustomerTool,
        lookupOrder: LookupOrderTool,
        searchKnowledgeBase: SearchKnowledgeBaseTool,
        endCall: EndCallTool,
        transferToHuman: TransferToHumanTool,
        createCallback: CreateCallbackTool,
      ) => [
        lookupCustomer,
        lookupOrder,
        searchKnowledgeBase,
        endCall,
        transferToHuman,
        createCallback,
      ],
      inject: [
        LookupCustomerTool,
        LookupOrderTool,
        SearchKnowledgeBaseTool,
        EndCallTool,
        TransferToHumanTool,
        CreateCallbackTool,
      ],
    },
  ],
  exports: [ConversationEngineService],
})
export class ConversationEngineModule {}
