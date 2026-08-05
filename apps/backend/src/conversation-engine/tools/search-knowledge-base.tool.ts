import { Injectable } from "@nestjs/common";

import { KnowledgeBaseService } from "../../knowledge-base/knowledge-base.service";
import type {
  AIToolExecutionContext,
  AIToolExecutionResult,
  AIToolParameterSchema,
  IAITool,
} from "./ai-tool.interface";

const MAX_RESULTS = 5;

/**
 * Improved retrieval (Sprint 19): returns a single answer + source
 * documents + confidence instead of a raw results list, via
 * KnowledgeBaseService.searchWithRelevance() (title+description+content
 * matching with relevance scoring -- see that method's doc comment for
 * why this isn't full semantic/embeddings search).
 */
@Injectable()
export class SearchKnowledgeBaseTool implements IAITool {
  constructor(private readonly knowledgeBaseService: KnowledgeBaseService) {}

  name(): string {
    return "search_knowledge_base";
  }

  description(): string {
    return "Searches the workspace's knowledge base and returns the best answer, its source documents, and a confidence score.";
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

    const result = await this.knowledgeBaseService.searchWithRelevance(
      context.workspaceId,
      query,
      MAX_RESULTS,
    );

    return { content: JSON.stringify(result) };
  }
}
