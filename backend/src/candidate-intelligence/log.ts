/**
 * Structured worker logs. Never emit secrets or webhook tokens.
 */

const REDACT =
  /sk-ant-[a-zA-Z0-9-_]+|Bearer\s+\S+|webhook_token[=:]\s*\S+|api[_-]?key[=:]\s*\S+|secret[=:]\s*\S+/gi;

export function workerLog(
  event: string,
  fields: Record<string, string | number | boolean | null | undefined>
): void {
  const safe: Record<string, unknown> = { event, ts: new Date().toISOString() };
  for (const [k, v] of Object.entries(fields)) {
    if (v == null) {
      safe[k] = v;
      continue;
    }
    if (typeof v === "string") {
      safe[k] = v.replace(REDACT, "[redacted]").slice(0, 500);
    } else {
      safe[k] = v;
    }
  }
  console.log(JSON.stringify(safe));
}
