import { Injectable, Logger } from "@nestjs/common";

import type { ToolCallRequest } from "../../ai/interfaces/ai-provider.interface";
import { AIToolRegistry } from "./ai-tool-registry";
import type {
  AIToolExecutionContext,
  AIToolExecutionResult,
} from "./ai-tool.interface";

/**
 * Executes a single ToolCallRequest against the registered tool. Never
 * throws -- a missing tool or a tool that errors internally produces a
 * graceful error result instead, so one failed tool call doesn't crash
 * the whole conversation turn (the model sees the error and can recover,
 * e.g. by trying a different approach or apologizing to the customer).
 */
@Injectable()
export class AIToolExecutor {
  private readonly logger = new Logger(AIToolExecutor.name);

  constructor(private readonly registry: AIToolRegistry) {}

  async execute(
    call: ToolCallRequest,
    context: AIToolExecutionContext,
  ): Promise<AIToolExecutionResult> {
    const tool = this.registry.getTool(call.name);

    if (!tool) {
      this.logger.warn(`Model requested unknown tool "${call.name}"`);
      return {
        content: JSON.stringify({ error: `Unknown tool: ${call.name}` }),
      };
    }

    try {
      return await tool.execute(call.arguments, context);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Tool "${call.name}" execution failed: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      return { content: JSON.stringify({ error: message }) };
    }
  }
}
