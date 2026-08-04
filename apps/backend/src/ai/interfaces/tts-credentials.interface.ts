import type { TtsProvider } from "../../generated/prisma/client";

export interface TTSProviderCredentials {
  provider: TtsProvider;
  /** Decrypted plaintext. Never log or persist this value. */
  apiKey: string;
  voice: string | null;
}
