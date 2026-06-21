/**
 * QVAC SDK config — loaded by both peers via QVAC_CONFIG_PATH.
 * Injects the local blind relay's public key as a swarmRelay so delegated
 * connections route through it when direct hole-punch fails (same-host demo).
 * If the relay key file is absent, swarmRelays is empty and the SDK behaves
 * exactly as default (direct DHT only).
 */
import { readFileSync } from "node:fs";

let swarmRelays = [];
try {
  const key = readFileSync(new URL("./.spike/relay-key.txt", import.meta.url), "utf8").trim();
  if (key) swarmRelays = [key];
} catch {
  // no relay running — fall back to direct DHT
}

export default {
  swarmRelays,
  loggerLevel: "warn",
};
