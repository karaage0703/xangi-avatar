import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAvatarProxy } from './proxy.mjs';
import { createAvatarAccess } from './access.mjs';
import { closeVoiceWorker } from './voice.mjs';
import { timingSafeEqual } from 'node:crypto';

const root = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
const port = Number.parseInt(process.env.PORT || '4173', 10);
const host = process.env.HOST || '127.0.0.1';

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

export function createAvatarServer({ managedToken } = {}) {
  if (!existsSync(join(root, 'index.html'))) throw new Error('dist/index.html is missing. Run npm run build first.');
  const proxy = createAvatarProxy();
  const allow = managedToken ? createAvatarAccess({ publicUrl: '', login: '' }) : createAvatarAccess();
  const server = createServer((request, response) => {
    if (managedToken) {
      const actual = Buffer.from(request.headers.authorization || '');
      const expected = Buffer.from(`Bearer ${managedToken}`);
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) { response.writeHead(401).end(); return; }
      if (request.method === 'GET' && request.url === '/health') { response.writeHead(200, {'content-type':'application/json'}).end('{"ready":true}'); return; }
      if (request.method === 'GET' && request.url === '/ui') {
        response.writeHead(200, {'content-type':'text/html; charset=utf-8', 'cache-control':'no-store'});
        response.end('<!doctype html><html lang="ja"><head><title>xangi-avatar</title></head><body><p>Avatarへ接続中…</p><script>location.replace(new URL("./service/", location.href).href)</script></body></html>'); return;
      }
    }
    if (!allow(request, response)) return;
    proxy(request, response, () => {
      const pathname = decodeURIComponent(new URL(request.url || '/', 'http://avatar.local').pathname);
      const relative = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '').replace(/^[/\\]+/, '');
      let file = resolve(root, relative || 'index.html');
      if (!file.startsWith(`${root}/`) && file !== root) {
        response.writeHead(400).end('invalid path');
        return;
      }
      if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
      response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600' });
      createReadStream(file).pipe(response);
    });
  });

  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createAvatarServer();
  server.listen(port, host, () => {
    console.log(`xangi-avatar: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
    console.log(`xangi: ${process.env.XANGI_URL || 'http://127.0.0.1:18888'}`);
  });

  process.once('SIGINT', () => { closeVoiceWorker(); server.close(); });
  process.once('SIGTERM', () => { closeVoiceWorker(); server.close(); });
}
