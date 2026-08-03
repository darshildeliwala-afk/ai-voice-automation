import { Module } from "@nestjs/common";

import { AiAgentModule } from "../ai-agent/ai-agent.module";
import { AiToolsModule } from "../conversation-engine/tools/ai-tools.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { CallbackNodeHandler } from "./engine/handlers/callback-node.handler";
import { ConditionNodeHandler } from "./engine/handlers/condition-node.handler";
import { EndNodeHandler } from "./engine/handlers/end-node.handler";
import { HumanTransferNodeHandler } from "./engine/handlers/human-transfer-node.handler";
import { PromptNodeHandler } from "./engine/handlers/prompt-node.handler";
import { ToolNodeHandler } from "./engine/handlers/tool-node.handler";
import { WorkflowExecutionEngine } from "./engine/workflow-execution.engine";
import {
  WORKFLOW_NODE_HANDLERS,
  WorkflowNodeHandlerRegistry,
} from "./engine/workflow-node-handler-registry";
import { WorkflowValidatorService } from "./validator/workflow-validator.service";
import { WorkflowController } from "./workflow.controller";
import { WorkflowService } from "./workflow.service";

@Module({
  imports: [WorkspaceModule, AiAgentModule, AiToolsModule],
  controllers: [WorkflowController],
  providers: [
    WorkflowService,
    WorkflowValidatorService,
    WorkflowExecutionEngine,
    WorkflowNodeHandlerRegistry,
    PromptNodeHandler,
    ConditionNodeHandler,
    ToolNodeHandler,
    EndNodeHandler,
    HumanTransferNodeHandler,
    CallbackNodeHandler,
    {
      provide: WORKFLOW_NODE_HANDLERS,
      useFactory: (
        prompt: PromptNodeHandler,
        condition: ConditionNodeHandler,
        tool: ToolNodeHandler,
        end: EndNodeHandler,
        humanTransfer: HumanTransferNodeHandler,
        callback: CallbackNodeHandler,
      ) => [prompt, condition, tool, end, humanTransfer, callback],
      inject: [
        PromptNodeHandler,
        ConditionNodeHandler,
        ToolNodeHandler,
        EndNodeHandler,
        HumanTransferNodeHandler,
        CallbackNodeHandler,
      ],
    },
  ],
  exports: [WorkflowService, WorkflowExecutionEngine],
})
export class WorkflowModule {}
