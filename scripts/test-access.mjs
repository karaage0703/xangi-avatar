import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { createAvatarAccess } from '../server/access.mjs';

const publicUrl = 'https://avatar.example.ts.net:4173';
const login = 'owner@example.com';
const allow = createAvatarAccess({ publicUrl, login });
let calls = 0;
const server = createServer((req, res) => {
  if (!allow(req, res)) return;
  calls++;
  res.end('allowed');
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const owner = { host: 'avatar.example.ts.net:4173', 'tailscale-user-login': login };
async function check(status, path = '/api/avatar/config', options = {}) {
  const before = calls;
  const actual = await new Promise((resolve, reject) => {
    const req = request(`${base}${path}`, options, res => {
      res.resume(); res.once('end', () => resolve(res.statusCode));
    });
    req.once('error', reject); req.end(options.body);
  });
  assert.equal(actual, status, `${options.method || 'GET'} ${path} ${JSON.stringify(options.headers || {})}`);
  assert.equal(calls - before, status === 200 ? 1 : 0, 'denied requests must not reach the application');
}
try {
  await check(200);
  await check(200, '/', { headers: { 'sec-fetch-site': 'cross-site' } });
  await check(200, '/api/avatar/message', { method: 'POST', headers: { origin: base } });
  await check(403, '/api/avatar/message', { method: 'POST' });
  await check(403, '/api/avatar/frame', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'image/jpeg' }, body: 'frame' });
  await check(403, '/api/avatar/events', { headers: { 'sec-fetch-site': 'cross-site' } });
  await check(403, '/api/avatar/config', { headers: { origin: 'null' } });
  await check(401, '/', { headers: { host: 'evil.example' } });
  await check(401, '/', { headers: { 'x-forwarded-for': '127.0.0.1' } });
  await check(401, '/', { headers: { 'tailscale-user-login': login } });
  await check(200, '/', { headers: owner });
  for (const path of ['config', 'agents', 'events', 'overlay/events', 'workspace-image', 'session/status']) {
    await check(200, `/api/avatar/${path}`, { headers: owner });
    await check(401, `/api/avatar/${path}`, { headers: { host: owner.host } });
    await check(401, `/api/avatar/${path}`, { headers: { ...owner, 'tailscale-user-login': 'other@example.com' } });
  }
  for (const path of ['message', 'session', 'session/close', 'frame', 'stt', 'tts', 'settings/notion', 'conversation-log', 'overlay/state']) {
    await check(200, `/api/avatar/${path}`, { method: 'POST', headers: { ...owner, origin: publicUrl } });
    await check(401, `/api/avatar/${path}`, { method: 'POST', headers: { host: owner.host, origin: publicUrl } });
    await check(403, `/api/avatar/${path}`, { method: 'POST', headers: { ...owner, origin: 'https://evil.example' } });
  }
  await check(200, '/api/avatar/settings/characters', { method: 'PUT', headers: { ...owner, origin: publicUrl } });
  await check(403, '/api/avatar/config', { headers: { ...owner, 'sec-fetch-site': 'same-site' } });
  const closed = createAvatarAccess({ publicUrl, login: '' });
  function fake(gate, remoteAddress, headers) {
    let status;
    const res = { writeHead(value) { status = value; return this; }, end() {} };
    assert.equal(gate({ socket: { remoteAddress, localPort: 4173 }, headers, method: 'GET', url: '/' }, res), false);
    return status;
  }
  assert.equal(fake(allow, '100.64.0.2', owner), 403);
  assert.equal(fake(allow, '192.168.1.2', { host: 'localhost:4173' }), 403);
  assert.equal(fake(closed, '127.0.0.1', owner), 401);
  for (const url of ['http://avatar.example', 'https://a.example/path', 'https://user@a.example', 'https://a.example/?x=1']) {
    assert.throws(() => createAvatarAccess({ publicUrl: url, login }));
  }
  assert.throws(() => createAvatarAccess({ publicUrl: '', login }));
  console.log('Avatar access: local, Tailnet owner, API coverage, CSRF, spoofing and configuration checks passed');
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
