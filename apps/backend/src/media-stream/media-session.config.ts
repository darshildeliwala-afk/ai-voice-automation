export const MEDIA_SESSION_CONFIG = Symbol("MEDIA_SESSION_CONFIG");

export interface MediaSessionConfig {
  /** How long to wait with no new STT transcript activity before finalizing a pending partial and triggering the ConversationEngine. */
  silenceTimeoutMs: number;
  /** How long to wait for ConversationEngine.processMessage() before treating the turn as timed out. */
  aiResponseTimeoutMs: number;
}

const DEFAULT_SILENCE_TIMEOUT_MS = 2000;
const DEFAULT_AI_RESPONSE_TIMEOUT_MS = 15000;

export function loadMediaSessionConfig(): MediaSessionConfig {
  return {
    silenceTimeoutMs:
      Number(process.env.MEDIA_SESSION_SILENCE_TIMEOUT_MS) || DEFAULT_SILENCE_TIMEOUT_MS,
    aiResponseTimeoutMs:
      Number(process.env.MEDIA_SESSION_AI_RESPONSE_TIMEOUT_MS) || DEFAULT_AI_RESPONSE_TIMEOUT_MS,
  };
}
