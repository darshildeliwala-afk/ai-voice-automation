import { Injectable } from "@nestjs/common";

export type SentimentLabel = "POSITIVE" | "NEUTRAL" | "NEGATIVE";

const POSITIVE_WORDS = [
  "thank you",
  "thanks",
  "great",
  "awesome",
  "excellent",
  "happy",
  "helpful",
  "perfect",
  "love",
  "appreciate",
  "good",
  "nice",
  "wonderful",
  "satisfied",
  "resolved",
  // common Hinglish terms, consistent with this codebase's Hinglish-first persona (Sprint 18)
  "achha",
  "badhiya",
  "shukriya",
  "dhanyavaad",
  "theek hai",
];

const NEGATIVE_WORDS = [
  "angry",
  "frustrated",
  "terrible",
  "worst",
  "bad",
  "hate",
  "disappointed",
  "complaint",
  "complain",
  "refund",
  "cancel",
  "unacceptable",
  "useless",
  "waste of time",
  "never again",
  "problem",
  "issue",
  "delay",
  "delayed",
  "broken",
  // common Hinglish terms
  "bekaar",
  "ganda",
  "pareshan",
  "gussa",
];

/**
 * Lightweight, dependency-free lexicon scorer (Sprint 19) -- mirrors
 * LanguageDetectionService's (Sprint 18) shape exactly: zero constructor
 * deps, pure text-in/label-out, trivially unit-testable. Deliberately
 * heuristic rather than an LLM call ("lightweight sentiment service") --
 * CallSummaryService uses this as the single canonical sentiment source
 * instead of also asking the LLM, so the two can never disagree.
 */
@Injectable()
export class SentimentAnalysisService {
  analyze(text: string): SentimentLabel {
    const normalized = text.toLowerCase();

    let score = 0;
    for (const word of POSITIVE_WORDS) {
      if (normalized.includes(word)) score += 1;
    }
    for (const word of NEGATIVE_WORDS) {
      if (normalized.includes(word)) score -= 1;
    }

    if (score > 0) return "POSITIVE";
    if (score < 0) return "NEGATIVE";
    return "NEUTRAL";
  }
}
