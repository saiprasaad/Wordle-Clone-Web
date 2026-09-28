// Minimal static file server for local play and the end-to-end tests.
// Usage: node scripts/serve.js [port]

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 8080);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
};

// Lets pages served locally reach the Firebase emulators (see firebase.json),
// which the production Content-Security-Policy doesn't allow.
function allowEmulators(html) {
  return html
    .replace("connect-src 'self'", "connect-src 'self' http://127.0.0.1:9099 http://127.0.0.1:8085")
    .replace('frame-src ', 'frame-src http://127.0.0.1:9099 ');
}

createServer(async (request, response) => {
  try {
    let path = normalize(decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
    if (path.endsWith(sep) || path.endsWith('/')) path += 'index.html';
    const file = join(ROOT, path);
    if (!file.startsWith(ROOT)) throw new Error('Outside the site root');
    let body = await readFile(file);
    if (extname(file) === '.html') body = allowEmulators(body.toString());
    response.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    response.end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}).listen(PORT, () => {
  console.log(`Serving ${ROOT} at http://localhost:${PORT}/`);
});
