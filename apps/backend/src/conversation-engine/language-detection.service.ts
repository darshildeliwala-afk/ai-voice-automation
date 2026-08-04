import { Injectable } from "@nestjs/common";

export interface DetectedLanguage {
  code: string;
  label: string;
  /** False for languages the customer can request but no configured STT/TTS provider fully supports yet -- still recorded, just flagged. */
  supported: boolean;
}

interface LanguageRule extends DetectedLanguage {
  patterns: RegExp[];
}

/**
 * Extensible registry of explicit language-preference requests -- adding a
 * language later is a one-entry addition here, never new branching logic
 * elsewhere. `supported: false` languages (e.g. Gujarati today) are still
 * detected and returned like any other match; it's on downstream
 * consumers (STTStreamOptions.language, TTSStreamOptions) to decide
 * whether/when to act on an unsupported code.
 */
const LANGUAGE_RULES: LanguageRule[] = [
  {
    code: "hi",
    label: "Hindi",
    supported: true,
    patterns: [/hindi\s+(mein|main|me)\b/i, /hindi\s+bol/i, /hindi\s+mai\s+baat/i],
  },
  {
    code: "en",
    label: "English",
    supported: true,
    patterns: [/speak.*english/i, /english\s+(mein|main|me|please)/i, /english\s+bol/i],
  },
  {
    code: "gu",
    label: "Gujarati",
    supported: false,
    patterns: [/gujarati\s+bol/i, /gujarati\s+(mein|main|me)\b/i],
  },
];

/**
 * Stateless detector (Sprint 18) for an explicit language-preference
 * request in a customer's message -- "Hindi mein boliye", "Can we speak
 * in English?", "Gujarati bolo". Zero constructor dependencies: pure
 * pattern matching, trivially unit-testable without mocking anything.
 * ConversationEngineService calls this on every incoming message and
 * persists a match onto the Conversation so it's exposed (not buried)
 * for the rest of the turn and any future STT/TTS provider to consume.
 */
@Injectable()
export class LanguageDetectionService {
  detectLanguagePreference(message: string): DetectedLanguage | null {
    for (const rule of LANGUAGE_RULES) {
      if (rule.patterns.some((pattern) => pattern.test(message))) {
        return { code: rule.code, label: rule.label, supported: rule.supported };
      }
    }

    return null;
  }
}
