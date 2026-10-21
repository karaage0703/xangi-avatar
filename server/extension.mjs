import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

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
// Managed mode binds an automatically allocated loopback port. The browser
// reaches it only through xangi's authenticated extension service proxy.
process.env.XANGI_URL ||= hostUrl || 'http://127.0.0.1:18888';
process.env.AVATAR_CHARACTER_SETTINGS_FILE = join(data, 'character-settings.json');
process.env.AVATAR_NOTION_SETTINGS_FILE = join(data, 'notion-settings.json');
process.env.AVATAR_CAPTURE_DIR = join(data, 'captures');
process.env.AVATAR_VOICE_ROOT ||= join(data, 'voice');
const { createAvatarServer } = await import('./index.mjs');
const { closeVoiceWorker } = await import('./voice.mjs');
const server = createAvatarServer({ managedToken: token });
server.listen(0, '127.0.0.1', () => console.log(JSON.stringify({
  schemaVersion: 2, event: 'ready', id: 'xangi-avatar',
  baseUrl: `http://127.0.0.1:${server.address().port}`, workspace, pid: process.pid,
})));
let closing = false;
function close() {
  if (closing) return;
  closing = true;
  closeVoiceWorker();
  server.close(); server.closeAllConnections();
  process.stdin.pause();
}
process.on('SIGTERM', close); process.on('SIGINT', close);
process.stdin.resume(); process.stdin.once('end', close);
