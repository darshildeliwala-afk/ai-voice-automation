/**
 * Fires `onTimeout` once `timeoutMs` elapses without a call to
 * recordActivity() -- MediaSessionService calls recordActivity() on every
 * STT transcript event (partial or final) and treats the timeout as "the
 * customer has gone quiet, finalize whatever partial transcript we have
 * and hand it to the ConversationEngine" (a fallback complement to the STT
 * provider's own endpointing, not a replacement for it).
 */
export class SilenceDetector {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly timeoutMs: number,
    private readonly onTimeout: () => void,
  ) {}

  recordActivity(): void {
    this.clear();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.onTimeout();
    }, this.timeoutMs);
  }

  stop(): void {
    this.clear();
  }

  private clear(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
