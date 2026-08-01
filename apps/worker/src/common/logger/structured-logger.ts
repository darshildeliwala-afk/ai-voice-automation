import { Injectable, type LoggerService } from "@nestjs/common";

export interface LogFields {
  [key: string]: unknown;
}

@Injectable()
export class StructuredLogger implements LoggerService {
  log(message: unknown, context?: string): void {
    this.emit("info", context ?? "Application", String(message));
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.emit(
      "error",
      context ?? "Application",
      String(message),
      trace ? { trace } : undefined,
    );
  }

  warn(message: unknown, context?: string): void {
    this.emit("warn", context ?? "Application", String(message));
  }

  debug(message: unknown, context?: string): void {
    this.emit("debug", context ?? "Application", String(message));
  }

  verbose(message: unknown, context?: string): void {
    this.emit("verbose", context ?? "Application", String(message));
  }

  /** Structured domain event, e.g. logger.event("CallQueueProcessor", "job claimed", { jobId, callQueueId }) */
  event(context: string, message: string, fields?: LogFields): void {
    this.emit("info", context, message, fields);
  }

  eventError(
    context: string,
    message: string,
    error?: unknown,
    fields?: LogFields,
  ): void {
    const errorFields =
      error instanceof Error
        ? {
            error: {
              name: error.name,
              message: error.message,
              stack: error.stack,
            },
          }
        : error !== undefined
          ? { error }
          : undefined;

    this.emit("error", context, message, { ...fields, ...errorFields });
  }

  private emit(
    level: string,
    context: string,
    message: string,
    fields?: LogFields,
  ): void {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      context,
      message,
      ...fields,
    };

    const line = JSON.stringify(entry);

    if (level === "error") {
      process.stderr.write(line + "\n");
    } else {
      process.stdout.write(line + "\n");
    }
  }
}
