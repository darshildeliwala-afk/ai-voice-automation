import { AiProvider } from "../../generated/prisma/client";

/** USD per 1M tokens. Approximate published list pricing -- update as providers change rates. */
interface ModelRate {
  promptPerMillion: number;
  completionPerMillion: number;
}

const OPENAI_RATES: Record<string, ModelRate> = {
  "gpt-4o": { promptPerMillion: 2.5, completionPerMillion: 10 },
  "gpt-4o-mini": { promptPerMillion: 0.15, completionPerMillion: 0.6 },
  "gpt-4-turbo": { promptPerMillion: 10, completionPerMillion: 30 },
  "gpt-3.5-turbo": { promptPerMillion: 0.5, completionPerMillion: 1.5 },
};

/** Used when a model isn't in the table above (new/unlisted model). */
const DEFAULT_RATE: ModelRate = {
  promptPerMillion: 5,
  completionPerMillion: 15,
};

const RATES_BY_PROVIDER: Partial<Record<AiProvider, Record<string, ModelRate>>> = {
  [AiProvider.OPENAI]: OPENAI_RATES,
  [AiProvider.AZURE_OPENAI]: OPENAI_RATES,
};

/**
 * Estimates USD cost from a static per-model pricing table -- not a live
 * pricing lookup. Falls back to DEFAULT_RATE for an unlisted model so a
 * new/renamed model never silently produces a $0 estimate.
 */
export function estimateCost(
  provider: AiProvider,
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const rate = RATES_BY_PROVIDER[provider]?.[model] ?? DEFAULT_RATE;

  const cost =
    (promptTokens / 1_000_000) * rate.promptPerMillion +
    (completionTokens / 1_000_000) * rate.completionPerMillion;

  return Math.round(cost * 1_000_000) / 1_000_000;
}
