/**
 * Framework-agnostic error hierarchy for telephony operations. Neither app
 * should throw NestJS HttpExceptions from inside this package (it has no
 * dependency on @nestjs/common) -- callers catch these and map them to
 * whatever's appropriate in their own context (an HTTP response in
 * apps/backend, a requeue/fail decision in apps/worker).
 */
export class TelephonyError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** No TelephonyConfig row exists at all for this workspace. */
export class TelephonyConfigMissingError extends TelephonyError {
  constructor(workspaceId: string) {
    super(
      `No telephony configuration found for workspace ${workspaceId}`,
      "TELEPHONY_CONFIG_MISSING",
    );
  }
}

/** A TelephonyConfig row exists but is not the active one. */
export class TelephonyProviderInactiveError extends TelephonyError {
  constructor(workspaceId: string) {
    super(
      `Telephony provider for workspace ${workspaceId} is not active`,
      "TELEPHONY_PROVIDER_INACTIVE",
    );
  }
}

/** The provider rejected the auth credentials (e.g. bad authId/authToken). */
export class TelephonyInvalidCredentialsError extends TelephonyError {
  constructor(provider: string, cause?: unknown) {
    super(
      `${provider} rejected the configured credentials`,
      "TELEPHONY_INVALID_CREDENTIALS",
    );
    this.cause = cause;
  }
}

/** The provider API did not respond within the allotted time. */
export class TelephonyProviderTimeoutError extends TelephonyError {
  constructor(provider: string, operation: string) {
    super(
      `${provider} timed out while performing ${operation}`,
      "TELEPHONY_PROVIDER_TIMEOUT",
    );
  }
}

/** The provider was rate-limiting our requests. */
export class TelephonyRateLimitError extends TelephonyError {
  constructor(provider: string) {
    super(`${provider} rate limit exceeded`, "TELEPHONY_RATE_LIMITED");
  }
}

/** A generic, non-2xx failure from the provider's API. */
export class TelephonyProviderApiError extends TelephonyError {
  constructor(
    provider: string,
    operation: string,
    public readonly status?: number,
    cause?: unknown,
  ) {
    super(
      `${provider} API call failed during ${operation}${status ? ` (HTTP ${status})` : ""}`,
      "TELEPHONY_PROVIDER_API_ERROR",
    );
    this.cause = cause;
  }
}

/** The webhook's signature did not validate against the configured secret. */
export class TelephonyWebhookSignatureError extends TelephonyError {
  constructor(provider: string) {
    super(
      `${provider} webhook signature validation failed`,
      "TELEPHONY_WEBHOOK_SIGNATURE_INVALID",
    );
  }
}

/** The webhook event has already been processed (duplicate delivery). */
export class TelephonyWebhookReplayError extends TelephonyError {
  constructor(provider: string, eventKey: string) {
    super(
      `${provider} webhook event ${eventKey} was already processed`,
      "TELEPHONY_WEBHOOK_REPLAY",
    );
  }
}
