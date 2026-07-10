/**
 * Phase-2 Spike B — BUYER side.
 * Loads the seller's custom "infermart-metering" plugin model remotely and
 * invokes its `echo` handler over the raw delegation channel. Proves a
 * definePlugin manifest bundled into the provider's worker serves remote
 * pluginInvoke calls — the foundation for provider-signed usage receipts.
 */
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import DHT from "hyperdht";
import RPC from "bare-rpc";

const providerPublicKey = (await readFile(".spike/phase2-provider-key.txt", "utf8")).trim();
const relayKey = (await readFile(".spike/relay-key.txt", "utf8")).trim();

const dht = new DHT();
const conn = dht.connect(Buffer.from(providerPublicKey, "hex"), {
  keyPair: DHT.keyPair(randomBytes(32)),
  relayThrough: [Buffer.from(relayKey, "hex")],
});
await new Promise<void>((resolve, reject) => {
  const to = setTimeout(() => reject(new Error("connect timeout")), 30_000);
  conn.once("open", () => { clearTimeout(to); resolve(); });
  conn.once("error", reject);
});
const rpc = new (RPC as any)(conn);
let cmdId = 0;
async function send(request: Record<string, unknown>): Promise<any> {
  const req = rpc.request(++cmdId);
  req.send(JSON.stringify(request), "utf-8");
  const payload = JSON.parse((await req.reply("utf-8"))?.toString() || "{}");
  if (payload.type === "error") throw new Error(`provider error: ${payload.message}`);
  return payload;
}

// Custom plugin model load: modelSrc points at a file that exists on the
// provider (path validation skipped by the plugin, but the src must resolve).
const load = await send({
  type: "loadModel",
  modelType: "infermart-metering",
  modelSrc: "./package.json",
  modelConfig: {},
});
console.log(`✅ remote custom-plugin model loaded: ${JSON.stringify(load)}`);

const nonce = randomBytes(8).toString("hex");
const result = await send({
  type: "pluginInvoke",
  modelId: load.modelId,
  handler: "echo",
  params: { modelId: load.modelId, nonce },
});
console.log(`📨 pluginInvoke result: ${JSON.stringify(result)}`);

const echoed = result.result ?? result;
console.log("\n── SPIKE B RESULT ───────────────────────────");
console.log(`custom plugin registered provider-side : ${load.success ? "YES" : "NO"}`);
console.log(`remote pluginInvoke round-trip          : ${echoed?.nonce === nonce ? "YES" : "NO"}`);
console.log(`handler ran in runtime                  : ${echoed?.runtime ?? "?"}`);
console.log("─────────────────────────────────────────────");

conn.destroy();
await dht.destroy();
process.exit(0);
