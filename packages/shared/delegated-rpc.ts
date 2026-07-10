/**
 * Raw QVAC delegation channel — extends delegated inference to the request
 * types the SDK's consumer runtime does not route yet (transcribe,
 * textToSpeech, pluginInvoke). See docs/spike-findings.md (Phase 2, Spike A):
 * the provider proxies every inbound request type through its handler
 * registry; only consumer-side routing is missing. This client speaks the
 * SDK's own wire protocol — hyperdht connect, bare-rpc framing, the same
 * zod-validated JSON frames, NDJSON response streams — over the same relay
 * and against the same firewall as the SDK's built-in delegation.
 */
import { randomBytes } from "node:crypto";
import DHT from "hyperdht";
import RPC from "bare-rpc";

export interface DelegatedChannelOptions {
  /** Hex public key of the provider to dial. */
  providerPublicKey: string;
  /** Optional blind-relay public keys (hex) for same-NAT traversal. */
  relayKeys?: string[];
  /** Reuse a stable identity so the firewall recognizes us; random if omitted. */
  seed?: Buffer;
  connectTimeoutMs?: number;
  /** Send a heartbeat frame this often to keep the DHT connection from idling out. */
  keepaliveMs?: number;
}

export interface DelegatedChannel {
  /** Our Hyperswarm public key (what the seller's firewall sees). */
  publicKey: string;
  /** Single-reply request (loadModel, pluginInvoke, heartbeat). */
  send<T = Record<string, unknown>>(request: Record<string, unknown>): Promise<T>;
  /** Streaming request → NDJSON frames (transcribe, textToSpeech). */
  stream(request: Record<string, unknown>): AsyncGenerator<Record<string, unknown>>;
  close(): Promise<void>;
}

class ProviderError extends Error {}

/** Dial the provider and hold one bare-rpc session over the DHT connection. */
export async function openDelegatedChannel(opts: DelegatedChannelOptions): Promise<DelegatedChannel> {
  const dht = new DHT();
  const keyPair = DHT.keyPair(opts.seed ?? randomBytes(32));
  const relayThrough = (opts.relayKeys ?? []).map((k) => Buffer.from(k, "hex"));

  const conn = dht.connect(Buffer.from(opts.providerPublicKey, "hex"), {
    keyPair,
    ...(relayThrough.length > 0 && { relayThrough }),
  });
  await waitForOpen(conn, opts.connectTimeoutMs ?? 30_000);

  const rpc = new RPC(conn);
  let commandId = 0;
  let closed = false;

  // The DHT drops an idle connection after ~a minute; a raw channel opened at
  // startup and used later (per voice note) would find a dead socket. A light
  // heartbeat keeps it warm — the provider answers `heartbeat` locally.
  const keepalive = setInterval(() => {
    if (closed) return;
    const req = rpc.request(++commandId);
    try {
      req.send(JSON.stringify({ type: "heartbeat" }), "utf-8");
      void req.reply("utf-8").catch(() => {});
    } catch {
      // connection gone; next real call surfaces the error
    }
  }, opts.keepaliveMs ?? 15_000);
  if (typeof keepalive.unref === "function") keepalive.unref();

  async function send<T>(request: Record<string, unknown>): Promise<T> {
    const req = rpc.request(++commandId);
    req.send(JSON.stringify(request), "utf-8");
    const reply = await req.reply("utf-8");
    const payload = JSON.parse(reply?.toString() || "{}") as T & { type?: string; message?: string };
    if (payload.type === "error") throw new ProviderError(payload.message ?? "unknown provider error");
    return payload;
  }

  async function* stream(request: Record<string, unknown>): AsyncGenerator<Record<string, unknown>> {
    const req = rpc.request(++commandId);
    req.send(JSON.stringify(request), "utf-8");
    const responseStream = req.createResponseStream({ encoding: "utf-8" });
    let buffer = "";
    for await (const chunk of responseStream) {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const frame = JSON.parse(line) as Record<string, unknown>;
        if (frame.type === "error") throw new ProviderError(String(frame.message ?? "unknown provider error"));
        yield frame;
      }
    }
  }

  async function close(): Promise<void> {
    closed = true;
    clearInterval(keepalive);
    conn.destroy();
    await dht.destroy();
  }

  return { publicKey: keyPair.publicKey.toString("hex"), send, stream, close };
}

function waitForOpen(conn: NodeJS.EventEmitter & { destroy(): void }, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`provider connect timeout after ${timeoutMs}ms`)), timeoutMs);
    const settle = (fn: () => void) => () => { clearTimeout(timer); fn(); };
    conn.once("open", settle(resolve));
    conn.once("error", (err: Error) => { clearTimeout(timer); reject(err); });
    conn.once("close", settle(() => reject(new Error("connection closed before open (firewalled or unreachable)"))));
  });
}
