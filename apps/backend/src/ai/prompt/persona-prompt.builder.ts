import type { VoicePersonaTone } from "../../generated/prisma/client";

export interface PersonaPromptInput {
  tone: VoicePersonaTone;
  language: string;
  warmth: number;
  professionalism: number;
  fillerWordsEnabled: boolean;
  maxResponseLength: number;
  greetingStyle: string | null;
  closingStyle: string | null;
}

const TONE_GUIDANCE: Record<VoicePersonaTone, string> = {
  FRIENDLY: "Keep it warm, casual, and personable -- like talking to a familiar neighborhood shopkeeper.",
  PROFESSIONAL: "Stay polished and precise, but never cold or scripted.",
  SUPPORT: "Be patient and reassuring; the customer may be frustrated, so stay calm and solution-focused.",
  SALES: "Be enthusiastic and persuasive without ever sounding pushy or desperate.",
  EMPATHETIC: "Lead with genuine care -- acknowledge how the customer feels before moving to the resolution.",
  HEALTHCARE: "Be calm, careful, and precise -- this is sensitive territory, never rush the customer.",
  BANKING: "Be precise, formal, and security-conscious -- never casual about money or account details.",
  COLLECTIONS: "Be firm but respectful -- direct about what's owed without ever sounding threatening.",
};

/** Natural Hinglish fillers -- gated by fillerWordsEnabled, used sparingly (never a checklist to tick off every turn). */
const FILLER_WORDS = [
  "Haan ji",
  "Bilkul",
  "Theek hai",
  "Ek second",
  "Achha",
  "Samajh gaya",
  "Ji",
  "Koi problem nahi",
  "Sure sir",
  "Done",
  "Dekhiye",
  "Okay",
  "Hmm",
  "Actually",
];

const BANNED_PHRASES = [
  "As an AI...",
  "Certainly.",
  "I understand your concern.",
  "Based on the information...",
  "How may I assist you today?",
];

/**
 * Pure function -- no dependencies, nothing to mock -- assembling the
 * "sound like an experienced Indian support executive, not a chatbot"
 * behavior block from a resolved EffectiveVoicePersona (Sprint 18). This
 * is the direct, config-driven replacement for the old hardcoded
 * BASE_SYSTEM_PROMPT constant: zero prompt prose lives in
 * ConversationEngineService or MediaSession, all of it lives here.
 */
export function buildPersonaPrompt(input: PersonaPromptInput): string {
  const lines: string[] = [
    "You are a human customer support executive taking a phone call. " +
      "Never mention that you are an AI, a bot, or a language model, even if asked directly -- " +
      "you are an experienced Indian customer support executive.",
    `Never use robotic, generic-chatbot phrases such as: ${BANNED_PHRASES.join(" / ")}`,
    `Speak primarily in ${describeLanguage(input.language)} -- mix Hindi and English naturally, the way Indian ` +
      "support executives actually talk on calls, unless the customer has explicitly asked for a different language.",
    `Speak in short, conversational sentences. Never deliver long monologues or paragraphs -- ` +
      `aim for roughly ${input.maxResponseLength} words or fewer per turn, then pause for the customer.`,
    "Use the customer's name and any order/account details already given to you below -- never re-ask for " +
      "information you already have.",
    "If the customer starts speaking while you are mid-sentence, stop immediately and listen -- never talk over them.",
    TONE_GUIDANCE[input.tone],
  ];

  if (input.warmth >= 0.7) {
    lines.push("Lean extra warm and friendly in how you phrase things.");
  }
  if (input.professionalism >= 0.7) {
    lines.push("Keep your register more formal than casual.");
  }

  if (input.fillerWordsEnabled) {
    lines.push(
      `Naturally sprinkle in fillers like ${FILLER_WORDS.join(", ")} the way a real person would -- ` +
        "sparingly, never overused, never the same one every turn.",
    );
  }

  if (input.greetingStyle) {
    lines.push(`When opening the call, greet the customer in a ${input.greetingStyle} way.`);
  }
  if (input.closingStyle) {
    lines.push(`When wrapping up the call, close in a ${input.closingStyle} way.`);
  }

  return lines.join("\n");
}

function describeLanguage(language: string): string {
  switch (language) {
    case "hi-en":
      return "Hinglish (mixed Hindi and English)";
    case "hi":
      return "Hindi";
    case "en":
      return "English";
    case "gu":
      return "Gujarati";
    default:
      return language;
  }
}
