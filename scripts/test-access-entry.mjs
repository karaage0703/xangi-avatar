import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, request } from 'node:http';
import { once } from 'node:events';

async function probe(port, path, headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, headers, method }, res => {
      res.resume(); res.once('end', () => resolve(res.statusCode));
    });
    req.once('error', reject); req.end();
  });
}
for (const mode of ['production', 'dev', 'preview']) {
  const reserve = createServer(); reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening');
  const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
  const args = mode === 'production' ? ['server/index.mjs'] : ['node_modules/vite/bin/vite.js', ...(mode === 'preview' ? ['preview'] : []), '--port', String(port), '--strictPort'];
  const child = spawn(process.execPath, args, { env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), AVATAR_PUBLIC_URL: 'https://avatar.example.ts.net', AVATAR_TRUSTED_TAILSCALE_LOGIN: 'owner@example.com' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; child.stdout.on('data', d => { log += d; }); child.stderr.on('data', d => { log += d; });
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error(log);
      try { ready = await probe(port, '/') === 200; } catch {}
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(ready, log);
    assert.equal(await probe(port, '/api/avatar/overlay/state'), 200, mode);
    assert.equal(await probe(port, '/api/avatar/overlay/state', { host: 'avatar.example.ts.net' }), 401, mode);
    assert.equal(await probe(port, '/api/avatar/overlay/state', { host: 'avatar.example.ts.net', 'tailscale-user-login': 'owner@example.com' }), 200, mode);
    assert.equal(await probe(port, '/api/avatar/message', { origin: 'https://evil.example' }, 'POST'), 403, mode);
    assert.ok([401, 403].includes(await probe(port, '/', { host: 'evil.example' })), mode);
    console.log(`${mode}: page, local API, trusted Serve, unauthenticated API and CSRF checks passed`);
  } finally {
    const exit = once(child, 'exit'); child.kill('SIGTERM'); await exit;
  }
}
