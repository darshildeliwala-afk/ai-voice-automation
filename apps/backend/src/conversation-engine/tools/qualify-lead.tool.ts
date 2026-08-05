import { Injectable } from "@nestjs/common";

import type { LeadInterestLevel } from "../../generated/prisma/client";
import { LeadQualificationService } from "../../lead-qualification/lead-qualification.service";
import type {
  AIToolExecutionContext,
  AIToolExecutionResult,
  AIToolParameterSchema,
  IAITool,
} from "./ai-tool.interface";

const INTEREST_LEVELS = ["LOW", "MEDIUM", "HIGH"];

/**
 * Lets the model record lead-qualification details as it learns them
 * during a conversation (Sprint 19) -- no hardcoded extraction logic,
 * the model decides what it has learned and calls this with whatever
 * fields it knows. One row per conversation, upsert-merged
 * (LeadQualificationService.upsertForConversation) so repeated calls
 * across a conversation accumulate fields instead of nulling out ones
 * learned earlier.
 */
@Injectable()
export class QualifyLeadTool implements IAITool {
  constructor(
    private readonly leadQualificationService: LeadQualificationService,
  ) {}

  name(): string {
    return "qualify_lead";
  }

  description(): string {
    return "Records lead-qualification details as they're learned during the conversation -- call with whatever fields you currently know; previously recorded fields are preserved.";
  }

  parameters(): AIToolParameterSchema {
    return {
      type: "object",
      properties: {
        name: { type: "string", description: "The lead's name." },
        company: { type: "string", description: "The lead's company." },
        budget: { type: "string", description: "Stated or implied budget." },
        requirement: { type: "string", description: "What the lead is looking for." },
        timeline: { type: "string", description: "When the lead wants to proceed." },
        city: { type: "string", description: "The lead's city." },
        email: { type: "string", description: "The lead's email address." },
        interestLevel: {
          type: "string",
          description: "How interested the lead sounds.",
          enum: INTEREST_LEVELS,
        },
      },
      required: [],
    };
  }

  async execute(
    args: Record<string, unknown>,
    context: AIToolExecutionContext,
  ): Promise<AIToolExecutionResult> {
    const fields = {
      name: asString(args.name),
      company: asString(args.company),
      budget: asString(args.budget),
      requirement: asString(args.requirement),
      timeline: asString(args.timeline),
      city: asString(args.city),
      email: asString(args.email),
      interestLevel: asInterestLevel(args.interestLevel),
    };

    const saved = await this.leadQualificationService.upsertForConversation(
      context.workspaceId,
      context.customerId,
      context.conversationId,
      fields,
    );

    return {
      content: JSON.stringify({
        saved: true,
        leadQualification: {
          name: saved.name,
          company: saved.company,
          budget: saved.budget,
          requirement: saved.requirement,
          timeline: saved.timeline,
          city: saved.city,
          email: saved.email,
          interestLevel: saved.interestLevel,
        },
      }),
    };
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asInterestLevel(value: unknown): LeadInterestLevel | undefined {
  return typeof value === "string" && INTEREST_LEVELS.includes(value)
    ? (value as LeadInterestLevel)
    : undefined;
}
