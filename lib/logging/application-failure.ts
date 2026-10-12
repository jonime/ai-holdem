import "server-only";

import { randomUUID } from "node:crypto";
import { z, ZodError } from "zod";
import { PokerRuleError } from "@/lib/poker/types";
import { UsageUnavailableError } from "@/lib/usage/errors";

const failureSchema = z.strictObject({
  operation: z.enum([
    "create_game_html", "create_quick_game_html", "create_game", "read_game",
    "action", "advance_departure", "advance_timeout", "feed", "heartbeat",
    "join", "next_hand", "publication", "remove", "reveal", "seat_count",
    "assign_bot", "claim", "name", "release", "settings", "start", "step", "public",
  ]),
  category: z.enum(["invalid_data", "poker_rule", "usage_unavailable", "unexpected"]),
  status: z.number().int().min(400).max(599),
});

type ApplicationFailure = z.infer<typeof failureSchema>;

// Do not inspect exception properties, even for Error instances. Recognized
// classes select fixed categories; expected route outcomes return before logging.
export function classifyApplicationFailure(error: unknown): ApplicationFailure["category"] {
  try {
    if (error instanceof ZodError) return "invalid_data";
    if (error instanceof PokerRuleError) return "poker_rule";
    if (error instanceof UsageUnavailableError) return "usage_unavailable";
  } catch {
    // Even hostile proxies must not prevent the original HTTP response.
  }
  return "unexpected";
}

export function logApplicationFailure(failure: ApplicationFailure): void {
  try {
    const parsed = failureSchema.safeParse(failure);
    if (!parsed.success) return;
    console.error({
      event: "application_request_failed",
      operation: parsed.data.operation,
      requestReference: randomUUID(),
      category: parsed.data.category,
      status: parsed.data.status,
    });
  } catch {
    // Validation, reference generation and sink failures are best-effort.
    // Never log rejected input or replace the original response.
  }
}
