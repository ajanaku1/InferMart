/**
 * InferMart local blind relay (NAT-traversal infra for the single-machine demo).
 *
 * A Hyperswarm blind relay is TURN-for-Holepunch: when two peers behind the same
 * NAT can't hole-punch directly, hyperdht routes the encrypted stream THROUGH this
 * relay (selected by its public key via the SDK's `swarmRelays` config). The P2P
 * inference stays real and end-to-end encrypted — the relay only forwards opaque
 * UDX frames, exactly like a TURN server. It cannot read or alter the traffic.
 *
 * Run this once; it prints a public key. Put that key in the QVAC config
 * (`swarmRelays`) for BOTH the seller and buyer processes.
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import DHT from "hyperdht";
import Relay from "blind-relay";

const SEED_FILE = ".spike/relay-seed.hex"; // gitignored; relay identity, controls no funds
const KEY_FILE = ".spike/relay-key.txt";

async function loadOrCreateSeed(): Promise<Buffer> {
  if (process.env.RELAY_SEED) return Buffer.from(process.env.RELAY_SEED, "hex");
  try {
    return Buffer.from((await readFile(SEED_FILE, "utf8")).trim(), "hex");
  } catch {
    const seed = randomBytes(32);
    await mkdir(".spike", { recursive: true });
    await writeFile(SEED_FILE, seed.toString("hex"), "utf8");
    return seed;
  }
}

const node = new DHT();
const relayServer = new Relay.Server({
  createStream(opts: object) {
    return node.createRawStream({ ...opts, framed: true });
  },
});

const server = node.createServer({ firewall: () => false }, (conn: { remotePublicKey: Buffer }) => {
  relayServer.accept(conn, { id: conn.remotePublicKey });
});

const keyPair = DHT.keyPair(await loadOrCreateSeed());
await server.listen(keyPair);

const publicKeyHex = keyPair.publicKey.toString("hex");
await mkdir(".spike", { recursive: true });
await writeFile(KEY_FILE, publicKeyHex, "utf8");

console.log("📡 InferMart blind relay live");
console.log(`   🆔 relay public key: ${publicKeyHex}`);
console.log(`   (written to ${KEY_FILE}; both peers load it via swarmRelays)`);
console.log("   forwarding encrypted UDX frames... Ctrl+C to stop");

process.on("SIGINT", () => {
  console.log("\n🛑 relay stopped");
  node.destroy();
  process.exit(0);
});
