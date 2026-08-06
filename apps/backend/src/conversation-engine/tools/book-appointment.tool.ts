import { Injectable } from "@nestjs/common";

import { AppointmentService } from "../../appointment/appointment.service";
import type {
  AIToolExecutionContext,
  AIToolExecutionResult,
  AIToolParameterSchema,
  IAITool,
} from "./ai-tool.interface";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Strict YYYY-MM-DD validation, including real calendar-date round-trip
 * checking -- `new Date("2026-02-30")` alone doesn't throw, it silently
 * rolls over to March 2nd, which would otherwise book the wrong day.
 */
function isValidCalendarDate(date: string): boolean {
  if (!DATE_PATTERN.test(date)) {
    return false;
  }
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/** Today's date in UTC, YYYY-MM-DD -- string-comparable against `date`. */
function todayUtcDateString(): string {
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${now.getUTCFullYear()}-${month}-${day}`;
}

/**
 * Generic booking interface (Sprint 19) -- pure DB record, no external
 * calendar integration. workspaceId/customerId/conversationId are always
 * resolved from the trusted AIToolExecutionContext, never model-supplied.
 */
@Injectable()
export class BookAppointmentTool implements IAITool {
  constructor(private readonly appointmentService: AppointmentService) {}

  name(): string {
    return "book_appointment";
  }

  description(): string {
    return "Books an appointment for the current customer. date must be YYYY-MM-DD, time must be 24h HH:mm, timezone must be an IANA name (e.g. Asia/Kolkata).";
  }

  parameters(): AIToolParameterSchema {
    return {
      type: "object",
      properties: {
        date: { type: "string", description: "Appointment date, YYYY-MM-DD." },
        time: { type: "string", description: "Appointment time, 24h HH:mm." },
        timezone: {
          type: "string",
          description: "IANA timezone, e.g. Asia/Kolkata.",
        },
        notes: { type: "string", description: "Any notes about the appointment." },
      },
      required: ["date", "time", "timezone"],
    };
  }

  async execute(
    args: Record<string, unknown>,
    context: AIToolExecutionContext,
  ): Promise<AIToolExecutionResult> {
    const date = typeof args.date === "string" ? args.date : "";
    const time = typeof args.time === "string" ? args.time : "";
    const timezone = typeof args.timezone === "string" ? args.timezone : "";
    const notes = typeof args.notes === "string" ? args.notes : undefined;

    if (!isValidCalendarDate(date)) {
      return {
        content: JSON.stringify({ error: `"${date}" is not a valid date. Use YYYY-MM-DD.` }),
      };
    }
    if (!TIME_PATTERN.test(time)) {
      return {
        content: JSON.stringify({ error: `"${time}" is not a valid 24h HH:mm time.` }),
      };
    }
    if (!timezone.trim()) {
      return { content: JSON.stringify({ error: "timezone is required." }) };
    }
    // Best-effort, UTC-day-granularity check (this codebase has no IANA
    // timezone-math dependency for exact per-timezone cutoffs) -- still
    // catches the common case of a clearly past date.
    if (date < todayUtcDateString()) {
      return { content: JSON.stringify({ error: `"${date}" is in the past.` }) };
    }

    const appointment = await this.appointmentService.createAppointment({
      workspaceId: context.workspaceId,
      customerId: context.customerId,
      conversationId: context.conversationId,
      date,
      time,
      timezone,
      notes,
    });

    return {
      content: JSON.stringify({
        booked: true,
        appointment: {
          id: appointment.id,
          date: appointment.date,
          time: appointment.time,
          timezone: appointment.timezone,
          status: appointment.status,
        },
      }),
    };
  }
}
