/** Tiny .env loader (no dependency). Existing process.env values win. */
import { readFile } from "node:fs/promises";

export async function loadDotenv(path = ".env"): Promise<void> {
  const text = await readFile(path, "utf8").catch(() => "");
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

export function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env: ${key}`);
  return v;
}
