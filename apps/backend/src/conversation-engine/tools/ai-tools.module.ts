import { Module } from "@nestjs/common";

import { CallQueueModule } from "../../call-queue/call-queue.module";
import { CustomerModule } from "../../customer/customer.module";
import { KnowledgeBaseModule } from "../../knowledge-base/knowledge-base.module";
import { OrderModule } from "../../order/order.module";
import { AIToolExecutor } from "./ai-tool-executor";
import { AI_TOOLS, AIToolRegistry } from "./ai-tool-registry";
import { CreateCallbackTool } from "./create-callback.tool";
import { EndCallTool } from "./end-call.tool";
import { LookupCustomerTool } from "./lookup-customer.tool";
import { LookupOrderTool } from "./lookup-order.tool";
import { SearchKnowledgeBaseTool } from "./search-knowledge-base.tool";
import { TransferToHumanTool } from "./transfer-to-human.tool";

/**
 * The Sprint 15 AI Tool Framework (IAITool/AIToolRegistry/AIToolExecutor +
 * the 6 tools), extracted into its own module so both ConversationEngine
 * (a PROMPT node's dynamic tool-calling loop) and the Sprint 16 workflow
 * engine (TOOL/END/HUMAN_TRANSFER/CALLBACK node handlers, which invoke a
 * specific named tool deterministically) can depend on it without a
 * circular import between the two.
 */
@Module({
  imports: [CustomerModule, OrderModule, KnowledgeBaseModule, CallQueueModule],
  providers: [
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
  exports: [AIToolRegistry, AIToolExecutor],
})
export class AiToolsModule {}
