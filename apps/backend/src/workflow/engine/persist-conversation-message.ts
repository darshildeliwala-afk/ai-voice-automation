import type { PrismaService } from "../../common/prisma/prisma.service";
import {
  ConversationRole,
  type Prisma,
} from "../../generated/prisma/client";
import type { ToolCallRequest } from "../../ai/interfaces/ai-provider.interface";
import type { AIToolExecutionResult } from "../../conversation-engine/tools/ai-tool.interface";

export async function persistMessage(
  prisma: PrismaService,
  conversationId: string,
  role: ConversationRole,
  content: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await prisma.conversationMessage.create({
    data: {
      conversationId,
      role,
      content,
      metadata: metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

/**
 * Persists the TOOL_CALL + TOOL_RESULT message pair for a single
 * deterministic tool invocation (TOOL/END/HUMAN_TRANSFER/CALLBACK node
 * handlers), mirroring the same metadata shape ConversationEngine's PROMPT
 * node handler uses for model-driven tool calls -- so the transcript looks
 * identical regardless of whether the model or the workflow graph decided
 * to call the tool.
 */
export async function persistToolInteraction(
  prisma: PrismaService,
  conversationId: string,
  call: ToolCallRequest,
  result: AIToolExecutionResult,
): Promise<void> {
  await persistMessage(prisma, conversationId, ConversationRole.TOOL_CALL, "", {
    toolCalls: [call],
  });
  await persistMessage(
    prisma,
    conversationId,
    ConversationRole.TOOL_RESULT,
    result.content,
    { toolCallId: call.id, toolName: call.name },
  );
}
