/**
 * Browser-walk server (temporary, team-docs only — never committed to app code).
 *
 * Serves the freshly built SPA from frontend/dist.staging and mirrors the live
 * nginx vhost (/etc/nginx/sites-enabled/elitekids) for the API:
 *   ^/(kids|schools|users|students|auth|verify-token|media|health)(/|$) -> :8484
 *   /api -> :8484
 * Everything else falls back to index.html (SPA routing).
 *
 * Usage: node team-docs/browser-walk/serve.mjs [port]
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const PORT = Number(process.argv[2] || 34777);
const ROOT = '/var/www/html/elite/elite-kids/frontend/dist.staging';
const API = 'http://127.0.0.1:8484';
const API_RE = /^\/(kids|schools|users|students|auth|verify-token|media|health|api)(\/|$)/;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'host', 'content-length']);

async function proxy(req, res) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (HOP.has(k.toLowerCase())) continue;
    headers[k] = Array.isArray(v) ? v.join(',') : v;
  }
  try {
    const upstream = await fetch(API + req.url, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
      redirect: 'manual',
    });
    res.writeHead(upstream.status, {
      'content-type': upstream.headers.get('content-type') || 'application/json',
      'cache-control': 'no-store',
    });
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.end(buf);
  } catch (err) {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'proxy failed', detail: String(err) }));
  }
}

const server = createServer(async (req, res) => {
  if (API_RE.test(req.url || '')) return proxy(req, res);

  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let filePath = join(ROOT, normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
  try {
    const s = await stat(filePath);
    if (s.isDirectory()) filePath = join(filePath, 'index.html');
  } catch {
    filePath = join(ROOT, 'index.html'); // SPA fallback
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      'content-type': MIME[extname(filePath)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(data);
  } catch (err) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end(`not found: ${urlPath} (${err.code})`);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[serve] http://127.0.0.1:${PORT} -> ${ROOT} (api -> ${API})`);
});
