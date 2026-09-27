import { spawn } from 'node:child_process';
import { timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const token = process.env.XANGI_EXTENSION_AUTH_TOKEN;
const hostUrl = process.env.XANGI_EXTENSION_HOST_URL;
const index = process.argv.indexOf('--workspace');
if (process.argv[2] !== 'serve' || !token || index < 0 || !process.argv[index + 1]) {
  console.error('Usage: xangi-extension serve --workspace <path> (managed runtime required)');
  process.exit(1);
}
const workspace = resolve(process.argv[index + 1]);
const data = resolve(process.env.AVATAR_DATA_DIR || join(process.env.DATA_DIR || join(workspace, '.xangi'), 'extensions', 'data', 'xangi-avatar'));
mkdirSync(data, { recursive: true, mode: 0o700 });
const config = join(data, 'config.env');
if (existsSync(config)) process.loadEnvFile(config);
const port = Number(process.env.AVATAR_PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('AVATAR_PORT must be 1..65535');
let publicUrl = process.env.AVATAR_PUBLIC_URL || '';
if (publicUrl) {
  const parsed = new URL(publicUrl);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('AVATAR_PUBLIC_URL must be an HTTP(S) URL without credentials');
  publicUrl = parsed.href;
}
if (!existsSync(join(root, 'dist/index.html'))) throw new Error('Run scripts/prepare-update before starting Avatar');
const child = spawn(process.execPath, [join(root, 'server/index.mjs')], {
  cwd: root,
  env: { ...process.env, HOST: process.env.AVATAR_HOST || '127.0.0.1', PORT: String(port),
    XANGI_URL: process.env.XANGI_URL || hostUrl || 'http://127.0.0.1:18888',
    AVATAR_CHARACTER_SETTINGS_FILE: join(data, 'character-settings.json'),
    AVATAR_NOTION_SETTINGS_FILE: join(data, 'notion-settings.json'),
    AVATAR_CAPTURE_DIR: join(data, 'captures'),
    AVATAR_VOICE_ROOT: process.env.AVATAR_VOICE_ROOT || join(data, 'voice'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.pipe(process.stderr);
child.stderr.pipe(process.stderr);
let closing = false;
let ready = false;
const gateway = createServer(async (req, res) => {
  const actual = Buffer.from(req.headers.authorization || '');
  const expected = Buffer.from(`Bearer ${token}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return res.writeHead(401).end();
  if (req.url === '/health') return res.writeHead(ready ? 200 : 503, {'content-type':'application/json'}).end(JSON.stringify({ready}));
  if (req.url !== '/') return res.writeHead(404).end();
  const encoded = JSON.stringify(publicUrl).replaceAll('<', '\\u003c');
  res.writeHead(200, {'content-type':'text/html; charset=utf-8', 'cache-control':'no-store'});
  res.end(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>xangi-avatar</title></head><body><h1>xangi-avatar</h1><p><a id="open" target="_blank" rel="noopener noreferrer">Avatarを開く</a></p><p>音声・画面共有にはlocalhostまたはHTTPSが必要です。別端末から使う場合はセットアップ手順に沿って公開URLを設定してください。</p><script>const link=document.getElementById('open');const configured=${encoded};link.href=configured||'http://localhost:${port}/';</script></body></html>`);
});
function close(code = 0) {
  if (closing) return;
  closing = true; ready = false;
  gateway.close(); gateway.closeAllConnections();
  child.kill('SIGTERM');
  const timer = setTimeout(() => { child.kill('SIGKILL'); process.exit(code); }, 3000);
  child.once('exit', () => { clearTimeout(timer); process.exit(code); });
  if (child.exitCode !== null || child.signalCode !== null) { clearTimeout(timer); process.exit(code); }
}
child.once('error', error => { console.error(error.message); close(1); });
child.once('exit', code => { if (!closing) close(code || 1); });
process.on('SIGTERM', () => close()); process.on('SIGINT', () => close());
process.stdin.resume(); process.stdin.once('end', () => close());
try {
  // Wait for this child to bind; an unrelated server on the same port is not readiness.
  await new Promise((done, fail) => {
    const timer = setTimeout(() => fail(new Error('Avatar startup timed out')), 10000);
    child.stdout.on('data', chunk => { if (chunk.toString().includes('xangi-avatar:')) { clearTimeout(timer); done(); } });
    child.once('exit', () => { clearTimeout(timer); fail(new Error('Avatar server exited before readiness')); });
    child.once('error', error => { clearTimeout(timer); fail(error); });
  });
  const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) });
  if (!response.ok) throw new Error('Avatar HTTP check failed');
  await response.body?.cancel(); ready = true;
  gateway.listen(0, '127.0.0.1', () => console.log(JSON.stringify({schemaVersion:2,event:'ready',id:'xangi-avatar',baseUrl:`http://127.0.0.1:${gateway.address().port}`,workspace,pid:process.pid})));
} catch (error) { console.error(error.message); close(1); }
