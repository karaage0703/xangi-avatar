import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAvatarProxy } from './proxy.mjs';
import { closeVoiceWorker } from './voice.mjs';

const root = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
const port = Number.parseInt(process.env.PORT || '4173', 10);
const host = process.env.HOST || '0.0.0.0';
const proxy = createAvatarProxy();
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

if (!existsSync(join(root, 'index.html'))) {
  console.error('dist/index.html is missing. Run npm run build first.');
  process.exit(1);
}

const server = createServer((request, response) => {
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

server.listen(port, host, () => {
  console.log(`xangi-avatar: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
  console.log(`xangi: ${process.env.XANGI_URL || 'http://127.0.0.1:18888'}`);
});

process.once('SIGINT', () => { closeVoiceWorker(); server.close(); });
process.once('SIGTERM', () => { closeVoiceWorker(); server.close(); });
