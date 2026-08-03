import type { AiProvider } from "../../generated/prisma/client";

export interface AIProviderCredentials {
  provider: AiProvider;
  /** Decrypted plaintext. Never log or persist this value. */
  apiKey: string;
  defaultModel: string | null;
  temperature: number;
}
