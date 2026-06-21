/**
 * Minimal localhost dashboard server: static HTML + Server-Sent Events + JSON POST.
 * No framework — each peer process serves its own dashboard and pushes live updates.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";

type PostHandler = (body: unknown) => unknown | Promise<unknown>;
const MIME: Record<string, string> = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" };

export interface DashboardServer {
  /** Push an SSE event to every connected dashboard. Also retained for late joiners. */
  broadcast(event: string, data: unknown): void;
  /** Register a JSON POST endpoint (e.g. the seller's /receipt). */
  onPost(path: string, handler: PostHandler): void;
  start(): void;
}

export function createDashboardServer(port: number, webDir: string): DashboardServer {
  const clients = new Set<ServerResponse>();
  const lastByEvent = new Map<string, unknown>(); // snapshot for late joiners
  const posts = new Map<string, PostHandler>();

  function broadcast(event: string, data: unknown): void {
    lastByEvent.set(event, data);
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) res.write(frame);
  }

  async function serveStatic(res: ServerResponse, file: string): Promise<void> {
    if (file.includes("..")) return void res.writeHead(403).end("forbidden"); // no path traversal
    try {
      const body = await readFile(join(webDir, file));
      res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  }

  function openStream(res: ServerResponse): void {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    for (const [event, data] of lastByEvent) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    clients.add(res);
    res.on("close", () => clients.delete(res));
  }

  async function handlePost(req: IncomingMessage, res: ServerResponse, handler: PostHandler): Promise<void> {
    try {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
      const result = (await handler(body)) ?? { ok: true };
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: String(err) }));
    }
  }

  function start(): void {
    createServer((req, res) => {
      const url = (req.url ?? "/").split("?")[0];
      if (url === "/events") return openStream(res);
      if (req.method === "POST" && posts.has(url)) return void handlePost(req, res, posts.get(url)!);
      return void serveStatic(res, url === "/" ? "index.html" : url.slice(1));
    }).listen(port, () => console.log(`   dashboard → http://localhost:${port}`));
  }

  return { broadcast, onPost: (p, h) => void posts.set(p, h), start };
}
