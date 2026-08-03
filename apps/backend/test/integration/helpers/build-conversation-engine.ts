import { AiAgentService } from "../../../src/ai-agent/ai-agent.service";
import { AIProviderFactory } from "../../../src/ai/providers/ai-provider.factory";
import { PromptBuilderService } from "../../../src/ai/prompt/prompt-builder.service";
import { CallQueueService } from "../../../src/call-queue/call-queue.service";
import { EncryptionService } from "../../../src/common/encryption/encryption.service";
import { PrismaService } from "../../../src/common/prisma/prisma.service";
import { ConversationEngineService } from "../../../src/conversation-engine/conversation-engine.service";
import { AIToolExecutor } from "../../../src/conversation-engine/tools/ai-tool-executor";
import { AIToolRegistry } from "../../../src/conversation-engine/tools/ai-tool-registry";
import { CreateCallbackTool } from "../../../src/conversation-engine/tools/create-callback.tool";
import { EndCallTool } from "../../../src/conversation-engine/tools/end-call.tool";
import { LookupCustomerTool } from "../../../src/conversation-engine/tools/lookup-customer.tool";
import { LookupOrderTool } from "../../../src/conversation-engine/tools/lookup-order.tool";
import { SearchKnowledgeBaseTool } from "../../../src/conversation-engine/tools/search-knowledge-base.tool";
import { TransferToHumanTool } from "../../../src/conversation-engine/tools/transfer-to-human.tool";
import { CustomerService } from "../../../src/customer/customer.service";
import { KnowledgeBaseService } from "../../../src/knowledge-base/knowledge-base.service";
import { OrderService } from "../../../src/order/order.service";
import { CallbackNodeHandler } from "../../../src/workflow/engine/handlers/callback-node.handler";
import { ConditionNodeHandler } from "../../../src/workflow/engine/handlers/condition-node.handler";
import { EndNodeHandler } from "../../../src/workflow/engine/handlers/end-node.handler";
import { HumanTransferNodeHandler } from "../../../src/workflow/engine/handlers/human-transfer-node.handler";
import { PromptNodeHandler } from "../../../src/workflow/engine/handlers/prompt-node.handler";
import { ToolNodeHandler } from "../../../src/workflow/engine/handlers/tool-node.handler";
import { WorkflowExecutionEngine } from "../../../src/workflow/engine/workflow-execution.engine";
import { WorkflowNodeHandlerRegistry } from "../../../src/workflow/engine/workflow-node-handler-registry";
import { WorkflowValidatorService } from "../../../src/workflow/validator/workflow-validator.service";
import { WorkflowService } from "../../../src/workflow/workflow.service";
import { AiProviderConfigService } from "../../../src/workspace-settings/ai-provider-config.service";
import { WorkspaceSettingsService } from "../../../src/workspace-settings/workspace-settings.service";
import { WorkspaceService } from "../../../src/workspace/workspace.service";

/**
 * Wires the full real dependency chain behind ConversationEngineService
 * (Sprint 15 AI tools + Sprint 16 workflow engine) against a single
 * PrismaService, for integration tests that need to exercise it against a
 * real Postgres database with only the `openai` SDK mocked. Shared between
 * telephony-webhook and conversation-engine integration specs so both stay
 * wired identically.
 */
export function buildConversationEngineTestChain(prisma: PrismaService) {
  const workspaceService = new WorkspaceService(prisma);
  const customerService = new CustomerService(prisma, workspaceService);
  const orderService = new OrderService(prisma, customerService);
  const aiAgentService = new AiAgentService(prisma, workspaceService);
  const knowledgeBaseService = new KnowledgeBaseService(prisma, workspaceService);
  const callQueueService = new CallQueueService(prisma);
  const encryptionService = new EncryptionService();
  const workspaceSettingsService = new WorkspaceSettingsService(prisma, workspaceService);
  const aiProviderConfigService = new AiProviderConfigService(
    prisma,
    workspaceService,
    encryptionService,
  );
  const providerFactory = new AIProviderFactory(aiProviderConfigService);
  const promptBuilder = new PromptBuilderService(
    prisma,
    workspaceSettingsService,
    aiAgentService,
    knowledgeBaseService,
    customerService,
    orderService,
  );

  const toolRegistry = new AIToolRegistry([
    new LookupCustomerTool(customerService),
    new LookupOrderTool(orderService),
    new SearchKnowledgeBaseTool(knowledgeBaseService),
    new EndCallTool(prisma),
    new TransferToHumanTool(),
    new CreateCallbackTool(callQueueService),
  ]);
  const toolExecutor = new AIToolExecutor(toolRegistry);

  const handlerRegistry = new WorkflowNodeHandlerRegistry([
    new PromptNodeHandler(prisma, toolExecutor, toolRegistry),
    new ConditionNodeHandler(),
    new ToolNodeHandler(prisma, toolExecutor),
    new EndNodeHandler(prisma, toolExecutor),
    new HumanTransferNodeHandler(prisma, toolExecutor),
    new CallbackNodeHandler(prisma, toolExecutor),
  ]);
  const workflowExecutionEngine = new WorkflowExecutionEngine(handlerRegistry);
  const workflowValidator = new WorkflowValidatorService();
  const workflowService = new WorkflowService(
    prisma,
    workspaceService,
    aiAgentService,
    workflowValidator,
    toolRegistry,
  );

  const conversationEngine = new ConversationEngineService(
    prisma,
    workspaceService,
    customerService,
    orderService,
    aiAgentService,
    providerFactory,
    promptBuilder,
    aiProviderConfigService,
    workflowService,
    workflowExecutionEngine,
  );

  return {
    workspaceService,
    customerService,
    orderService,
    aiAgentService,
    knowledgeBaseService,
    callQueueService,
    aiProviderConfigService,
    workflowService,
    conversationEngine,
  };
}
