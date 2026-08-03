/**
 * Framework-agnostic error hierarchy for the AI provider layer, mirroring
 * the pattern established for telephony (see
 * @ai-voice-automation/telephony-core's TelephonyError). No @nestjs/common
 * dependency here -- callers (a future controller) map these to HTTP
 * responses however is appropriate for their context.
 */
export class AIError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** No AiProviderConfig row exists at all for this workspace. */
export class AIProviderConfigMissingError extends AIError {
  constructor(workspaceId: string) {
    super(
      `No AI provider configuration found for workspace ${workspaceId}`,
      "AI_PROVIDER_CONFIG_MISSING",
    );
  }
}

/** An AiProviderConfig row exists but is not the active one. */
export class AIProviderInactiveError extends AIError {
  constructor(workspaceId: string) {
    super(
      `AI provider for workspace ${workspaceId} is not active`,
      "AI_PROVIDER_INACTIVE",
    );
  }
}

/** The requested provider has no concrete implementation yet (placeholder). */
export class AIProviderNotImplementedError extends AIError {
  constructor(providerName: string) {
    super(
      `${providerName} is a placeholder and not yet implemented`,
      "AI_PROVIDER_NOT_IMPLEMENTED",
    );
  }
}

/** The provider rejected the API key (e.g. invalid/expired). */
export class AIInvalidCredentialsError extends AIError {
  constructor(providerName: string, cause?: unknown) {
    super(
      `${providerName} rejected the configured API key`,
      "AI_INVALID_CREDENTIALS",
    );
    this.cause = cause;
  }
}

/** The provider was rate-limiting our requests. */
export class AIRateLimitError extends AIError {
  constructor(providerName: string) {
    super(`${providerName} rate limit exceeded`, "AI_RATE_LIMITED");
  }
}

/** The provider API did not respond within the allotted time. */
export class AIProviderTimeoutError extends AIError {
  constructor(providerName: string) {
    super(`${providerName} timed out`, "AI_PROVIDER_TIMEOUT");
  }
}

/** A generic, non-2xx failure from the provider's API. */
export class AIProviderApiError extends AIError {
  constructor(
    providerName: string,
    public readonly status?: number,
    cause?: unknown,
  ) {
    super(
      `${providerName} API call failed${status ? ` (HTTP ${status})` : ""}`,
      "AI_PROVIDER_API_ERROR",
    );
    this.cause = cause;
  }
}
