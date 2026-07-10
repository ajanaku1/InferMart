/**
 * Structured audit log (JSONL). One event per line, appended atomically.
 *
 * Captures model load/unload events and per-inference performance (prompt, prompt +
 * generated tokens, time-to-first-token, tokens/sec) for a demo run. Both peer processes
 * append to the same file so a single log tells the whole story of a session.
 */
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const AUDIT_PATH = process.env.AUDIT_LOG_PATH ?? "logs/audit-log.jsonl";

export type AuditEvent = Record<string, unknown> & { type: string; role: "buyer" | "seller" };

/** Append one timestamped event as a JSON line. Never throws into the request path. */
export async function audit(event: AuditEvent): Promise<void> {
  try {
    await mkdir(dirname(AUDIT_PATH), { recursive: true });
    await appendFile(AUDIT_PATH, JSON.stringify({ ts: new Date().toISOString(), ...event }) + "\n", "utf8");
  } catch {
    // auditing must never break the demo
  }
}
