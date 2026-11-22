// Minimal static file server for tests. No dependencies.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.md': 'text/markdown; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon', '.wasm': 'application/wasm'
};

/**
 * Serve `root` on 127.0.0.1 at a free port.
 * `overrides` maps a URL prefix (e.g. "/assets/") to another directory.
 * Returns { url, close }.
 */
export async function serve(root, overrides = {}) {
  root = resolve(root);
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let base = root;
      for (const [prefix, dir] of Object.entries(overrides)) {
        if (path.startsWith(prefix)) { base = resolve(dir); path = '/' + path.slice(prefix.length); break; }
      }
      let file = normalize(join(base, path));
      if (file !== base && !file.startsWith(base + sep)) { res.writeHead(403).end('Forbidden'); return; }
      let info = await stat(file).catch(() => null);
      if (info && info.isDirectory()) { file = join(file, 'index.html'); info = await stat(file).catch(() => null); }
      if (!info) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
    } catch (e) {
      res.writeHead(500).end(String(e));
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return { url: `http://127.0.0.1:${port}/`, close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }) };
}
