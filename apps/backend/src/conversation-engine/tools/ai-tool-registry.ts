import { Inject, Injectable } from "@nestjs/common";

import type { AIToolDefinition } from "../../ai/interfaces/ai-provider.interface";
import type { IAITool } from "./ai-tool.interface";

export const AI_TOOLS = Symbol("AI_TOOLS");

/**
 * Holds every registered IAITool (injected as an array via the AI_TOOLS
 * token -- see conversation-engine.module.ts) and exposes them by name for
 * AIToolExecutor, plus the provider-agnostic tool definitions to hand to
 * IAIProvider.chat(). Adding a new tool means adding it to the AI_TOOLS
 * provider factory; nothing else in the framework changes.
 */
@Injectable()
export class AIToolRegistry {
  private readonly toolsByName: Map<string, IAITool>;

  constructor(@Inject(AI_TOOLS) tools: IAITool[]) {
    this.toolsByName = new Map(tools.map((tool) => [tool.name(), tool]));
  }

  getTool(name: string): IAITool | undefined {
    return this.toolsByName.get(name);
  }

  getAll(): IAITool[] {
    return [...this.toolsByName.values()];
  }

  getToolDefinitions(): AIToolDefinition[] {
    return this.getAll().map((tool) => ({
      name: tool.name(),
      description: tool.description(),
      parameters: tool.parameters() as unknown as Record<string, unknown>,
    }));
  }
}
