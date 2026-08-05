import { Injectable, Logger } from "@nestjs/common";

import { AIProviderFactory } from "../ai/providers/ai-provider.factory";
import { PrismaService } from "../common/prisma/prisma.service";
import { Sentiment } from "../generated/prisma/client";
import { SentimentAnalysisService } from "./sentiment-analysis.service";

const SUMMARY_SYSTEM_PROMPT =
  "You summarize a completed customer support phone call transcript. " +
  "Respond with ONLY a strict JSON object (no markdown, no commentary) matching exactly this shape: " +
  '{"customerName": string|null, "reason": string|null, "outcome": string|null, ' +
  '"followUpRecommendation": string|null, "callbackRequired": boolean, "agentPerformance": string|null, ' +
  '"ordersDiscussed": string[], "problems": string[]}. ' +
  "Use null for any field you cannot determine from the transcript. Never invent details not present in the transcript.";

interface ParsedSummary {
  customerName: string | null;
  reason: string | null;
  outcome: string | null;
  followUpRecommendation: string | null;
  callbackRequired: boolean;
  agentPerformance: string | null;
  ordersDiscussed: string[];
  problems: string[];
}

const EMPTY_SUMMARY: ParsedSummary = {
  customerName: null,
  reason: null,
  outcome: null,
  followUpRecommendation: null,
  callbackRequired: false,
  agentPerformance: null,
  ordersDiscussed: [],
  problems: [],
};

function parseSummary(content: string): ParsedSummary {
  try {
    const parsed = JSON.parse(content) as Partial<ParsedSummary>;
    return {
      customerName: parsed.customerName ?? null,
      reason: parsed.reason ?? null,
      outcome: parsed.outcome ?? null,
      followUpRecommendation: parsed.followUpRecommendation ?? null,
      callbackRequired: parsed.callbackRequired ?? false,
      agentPerformance: parsed.agentPerformance ?? null,
      ordersDiscussed: Array.isArray(parsed.ordersDiscussed) ? parsed.ordersDiscussed : [],
      problems: Array.isArray(parsed.problems) ? parsed.problems : [],
    };
  } catch {
    // Model didn't return valid JSON -- fall back to an empty summary
    // rather than throw; a missing/blank summary is far better than
    // crashing the end_call flow that triggered this.
    return EMPTY_SUMMARY;
  }
}

/**
 * Generates a structured call summary automatically at the end of every
 * call (Sprint 19), called from EndCallTool. Sentiment comes from the
 * lightweight SentimentAnalysisService heuristic, not the LLM -- one
 * canonical sentiment source rather than two that could disagree.
 * Everything else comes from a single structured-JSON LLM call over the
 * conversation transcript. Never throws -- callers (EndCallTool) wrap
 * this in try/catch anyway, but internal failures (missing provider
 * config, malformed JSON) degrade to a best-effort/empty summary rather
 * than blocking call termination.
 */
@Injectable()
export class CallSummaryService {
  private readonly logger = new Logger(CallSummaryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerFactory: AIProviderFactory,
    private readonly sentimentAnalysisService: SentimentAnalysisService,
  ) {}

  async generateAndPersist(
    conversationId: string,
    workspaceId: string,
  ): Promise<void> {
    const messages = await this.prisma.conversationMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
    });

    const transcript = messages
      .filter((message) => message.role === "USER" || message.role === "ASSISTANT")
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n");

    const sentimentLabel = this.sentimentAnalysisService.analyze(transcript);
    const sentiment = Sentiment[sentimentLabel];

    const parsed = await this.generateStructuredSummary(workspaceId, transcript);

    await this.prisma.$transaction([
      this.prisma.conversationSummary.upsert({
        where: { conversationId },
        create: {
          workspaceId,
          conversationId,
          sentiment,
          ...parsed,
        },
        update: {
          sentiment,
          ...parsed,
        },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { sentiment },
      }),
    ]);
  }

  private async generateStructuredSummary(
    workspaceId: string,
    transcript: string,
  ): Promise<ParsedSummary> {
    if (!transcript.trim()) {
      return EMPTY_SUMMARY;
    }

    try {
      const provider = await this.providerFactory.createForWorkspace(workspaceId);
      const completion = await provider.chat({
        messages: [
          { role: "system", content: SUMMARY_SYSTEM_PROMPT },
          { role: "user", content: transcript },
        ],
      });

      return parseSummary(completion.content);
    } catch (error) {
      this.logger.error(
        `Structured call summary generation failed for workspace ${workspaceId}`,
        error instanceof Error ? error.stack : String(error),
      );
      return EMPTY_SUMMARY;
    }
  }
}
