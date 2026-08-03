import { Injectable } from "@nestjs/common";

import { KnowledgeBaseService } from "../../knowledge-base/knowledge-base.service";
import type {
  AIToolExecutionContext,
  AIToolExecutionResult,
  AIToolParameterSchema,
  IAITool,
} from "./ai-tool.interface";

const MAX_RESULTS = 5;

@Injectable()
export class SearchKnowledgeBaseTool implements IAITool {
  constructor(private readonly knowledgeBaseService: KnowledgeBaseService) {}

  name(): string {
    return "search_knowledge_base";
  }

  description(): string {
    return "Searches the workspace's knowledge base for articles relevant to a query.";
  }

  parameters(): AIToolParameterSchema {
    return {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "What to search for, e.g. 'return policy'.",
        },
      },
      required: ["query"],
    };
  }

  async execute(
    args: Record<string, unknown>,
    context: AIToolExecutionContext,
  ): Promise<AIToolExecutionResult> {
    const query = typeof args.query === "string" ? args.query : "";

    if (!query.trim()) {
      return {
        content: JSON.stringify({ error: "query is required" }),
      };
    }

    const { data } = await this.knowledgeBaseService.listKnowledgeBases(
      context.workspaceId,
      { page: 1, limit: MAX_RESULTS },
      query,
    );

    return {
      content: JSON.stringify({
        results: data.map((entry) => ({
          title: entry.title,
          description: entry.description,
          content: entry.content,
        })),
      }),
    };
  }
}
