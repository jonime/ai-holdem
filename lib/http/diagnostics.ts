import { buildIdentifier } from "../build-identifier";
import { z } from "zod";
import { HttpError } from "./http-error";
import { TransportError } from "./deadline";

const operations = ["shares.editTitle", "shares.list", "shares.revokeOwned", "shares.active", "shares.create", "shares.revoke", "shares.read", "bots.catalog", "discovery.remove", "discovery.mine", "discovery.join", "discovery.publication", "discovery.heartbeat", "discovery.list", "creation.custom", "creation.quickPlay", "seats.claim", "seats.release", "seats.rename", "seats.assignBot", "games.results", "games.replay", "games.feed", "games.start", "games.nextHand", "games.reveal", "games.settings", "games.seatCount", "games.get", "games.submitAction", "games.advanceTimeout", "games.advanceDeparture", "games.stepBot"] as const;
export const diagnosticSchema = z.object({
  operation: z.enum(operations),
  timestamp: z.iso.datetime(),
  kind: z.enum(["http", "network", "deadline", "invalidResponse"]),
  status: z.number().int().min(100).max(599).optional(),
  requestReference: z.string().uuid().optional().catch(undefined),
  build: z.string().regex(/^(?:[a-f0-9]{40}|local\/unknown)$/),
});
export type Diagnostic = z.infer<typeof diagnosticSchema>;
export type DiagnosticReport = readonly Diagnostic[];
const failures = new WeakMap<object, Diagnostic>();
export function captureDiagnostic(error: unknown, operation?: Diagnostic["operation"]): DiagnosticReport {
  try {
    if (typeof error !== "object" || error === null) return [];
    const known = failures.get(error);
    if (known) return [known];
    if (!operation || !(error instanceof TransportError || error instanceof HttpError)) return [];
    if (error instanceof HttpError && error.status < 500 || error instanceof TransportError && error.kind === "cancelled") return [];
    const parsed = diagnosticSchema.safeParse({ operation, timestamp: new Date().toISOString(),
      kind: error instanceof HttpError ? "http" : error.kind,
      status: error.status,
      ...(error instanceof HttpError ? { requestReference: error.requestReference } : {}),
      build: buildIdentifier(process.env.APP_BUILD_IDENTIFIER) });
    if (!parsed.success) return [];
    failures.set(error, parsed.data);
    return [parsed.data];
  } catch { return []; }
}
export function recoveryDiagnostics(original: DiagnosticReport, error: unknown): DiagnosticReport {
  return [...original.slice(0, 1), ...captureDiagnostic(error).slice(0, 1)];
}
export function formatDiagnostics(report: DiagnosticReport): string {
  return report.slice(0, 2).flatMap((record, index) => {
    let parsed: ReturnType<typeof diagnosticSchema.safeParse>;
    try { parsed = diagnosticSchema.safeParse(record); } catch { return []; }
    if (!parsed.success) return [];
    const d = parsed.data;
    return [`${index === 0 ? "Operation failure" : "Recovery failure"}\noperation: ${d.operation}\ntimestamp: ${d.timestamp}\nkind: ${d.kind}\n${d.status ? `status: ${d.status}\n` : ""}serverReference: ${d.kind === "http" && d.requestReference ? d.requestReference : "Server reference unavailable"}\nbuild: ${d.build}`];
  }).join("\n\n");
}
// Names come only from this fixed method catalog, never request URLs or inputs.
export function instrumentApi<T extends Record<string, Record<string, (...args: never[]) => Promise<unknown>>>>(catalog: T): T {
  for (const [group, methods] of Object.entries(catalog)) {
    for (const [method, run] of Object.entries(methods)) {
      const operation = z.enum(operations).parse(`${group}.${method}`);
      methods[method] = (...args: never[]) => run(...args).catch(error => {
        captureDiagnostic(error, operation);
        throw error;
      });
    }
  }
  return catalog;
}
