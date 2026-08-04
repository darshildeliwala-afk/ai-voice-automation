import type { SttProvider } from "../../generated/prisma/client";

export interface STTProviderCredentials {
  provider: SttProvider;
  /** Decrypted plaintext. Never log or persist this value. */
  apiKey: string;
  language: string;
}
