import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAvatarProxy, normalizeXangiUrl } from '../server/proxy.mjs';

assert.equal(normalizeXangiUrl('http://localhost:18888/path?q=1#x'), 'http://localhost:18888/path');
assert.throws(() => normalizeXangiUrl('file:///tmp/x'), /http or https/);

let receivedBody = '';
let agentBody = null;
const agents = [{ id: 'a1', name: '本体のAgent', role: '相棒', prompt: '本体の指示', backend: 'codex', model: 'model-a', localLlmMode: 'agent', localLlmReasoningEffort: 'high', effort: 'high' }];
const agentSnapshot = structuredClone(agents);
let sessionBody = null;
let sessionPatchBody = null;
const webCommandBodies = [];
let closedSessionBody = null;
let workspacePath = '/workspace';
const presetWorkspaces = [];
let workspaceRegistrations = 0;
const upstream = createServer((req, res) => {
  if (req.url === '/api/config') return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ allowedBackends: ['codex'] }));
  if (req.url === '/api/workspaces' && req.method === 'POST') {
    let body = ''; req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const workspace = { ...JSON.parse(body), id: `ws-${++workspaceRegistrations}` };
      presetWorkspaces.push(workspace);
      res.writeHead(201, { 'content-type': 'application/json' }).end(JSON.stringify({ workspace }));
    }); return;
  }
  if (req.url === '/api/workspaces') return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ workspaces: [{ id: 'default', name: 'default', path: workspacePath }, ...presetWorkspaces] }));
  if (req.url === '/api/agents' && req.method === 'GET') return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({agents}));
  if (req.url.startsWith('/api/agents') && ['POST','PATCH'].includes(req.method)) {
    let body = ''; req.on('data', chunk => {body += chunk;});
    req.on('end', () => {
      agentBody = JSON.parse(body);
      const id = req.method === 'POST' ? `a${agents.length + 1}` : req.url.split('/').at(-1);
      const agent = { ...agentBody, id };
      const index = agents.findIndex(a => a.id === id);
      if (index < 0) agents.push(agent); else agents[index] = agent;
      res.writeHead(200, {'content-type':'application/json'}).end(JSON.stringify({agent}));
    }); return;
  }
  if (req.url === '/api/sessions' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      sessionBody = JSON.parse(body);
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ sessionId: 's-project' }));
    });
    return;
  }
  if (req.url === '/api/sessions/s-project' && req.method === 'PATCH') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      sessionPatchBody = JSON.parse(body);
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true }));
    });
    return;
  }
  if (req.url === '/api/web-commands' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      webCommandBodies.push(JSON.parse(body));
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ kind: 'message', message: '設定しました' }));
    });
    return;
  }
  if (req.url === '/api/sessions/s-project?limit=1' && req.method === 'GET') {
    return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id: 's-project', lifecycle: 'open', messages: [], modelExecution: { backend: 'local-llm', effectiveModel: 'observed-model', source: 'provider', observedModels: ['observed-model'] } }));
  }
  if (req.url === '/api/sessions/s-project/close' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      closedSessionBody = JSON.parse(body);
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, lifecycle: 'closed' }));
    });
    return;
  }
  if (req.url === '/api/device/inbox' && req.method === 'POST') {
    req.on('data', (chunk) => { receivedBody += chunk; });
    req.on('end', () => {
      res.writeHead(202, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ accepted: true, session_id: 's1', thread_id: 'web:s1', turn_id: 'web-msg-1' }));
    });
    return;
  }
  if (req.url === '/api/events/stream') {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end('event: ready\ndata: {"instance_id":"test"}\n\n');
    return;
  }
  res.writeHead(404).end();
});
await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
const upstreamPort = upstream.address().port;

const captureRoot = await mkdtemp(join(tmpdir(), 'xangi-avatar-frame-'));
const captureTargetDir = join(captureRoot, 'captures-target');
const captureDir = join(captureRoot, 'captures-link');
await mkdir(captureTargetDir);
await symlink(captureTargetDir, captureDir, 'dir');
workspacePath = join(captureRoot, 'workspace');
await mkdir(join(workspacePath, 'assets'), { recursive: true });
const pngImage = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x74, 0x65, 0x73, 0x74]);
await writeFile(join(workspacePath, 'assets', 'avatar.png'), pngImage);
await writeFile(join(workspacePath, 'assets', 'fake.png'), Buffer.from('not-an-image'));
await writeFile(join(captureRoot, 'outside.png'), Buffer.from('outside'));
const notionEntries = [];
const notionSettingsUpdates = [];
let savedCharacterSettings = { customCharacters: [{ id: 'custom-1', name: 'borot' }], selectedCharacter: 'custom-1' };
const characterSettings = {
  async getSettings() { return savedCharacterSettings; },
  async saveSettings(input) { savedCharacterSettings = input; return savedCharacterSettings; },
};
const notionLog = {
  configured: true,
  getSettings() {
    return { configured: true, tokenConfigured: true, parentPageId: 'parent-page', parentPageUrl: 'https://app.notion.com/p/parent-page' };
  },
  async configureParentPage(parentPage) {
    notionSettingsUpdates.push(parentPage);
    return { configured: true, tokenConfigured: true, parentPageId: 'new-parent', parentPageUrl: 'https://app.notion.com/p/new-parent', parentPageTitle: '会話ログ' };
  },
  async appendEntry(entry) {
    notionEntries.push(entry);
    return { pageId: 'notion-page-1', pageUrl: 'https://notion.so/notion-page-1' };
  },
};
const proxyHandler = createAvatarProxy({ xangiUrl: `http://127.0.0.1:${upstreamPort}`, captureDir, notionLog, characterSettings });
const proxy = createServer((req, res) => proxyHandler(req, res, () => res.writeHead(404).end()));
await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
const proxyPort = proxy.address().port;

try {
  const config = await fetch(`http://127.0.0.1:${proxyPort}/api/avatar/config`).then((response) => response.json());
  assert.deepEqual(config.agents.map(({ id }) => id), ['a1']);
  assert.equal(config.agents[0].prompt, undefined);
  const listed = await fetch(`http://127.0.0.1:${proxyPort}/api/avatar/agents`).then(r => r.json());
  assert.deepEqual(listed.agents, config.agents);
  assert.equal(typeof config.voice.configured, 'boolean');
  assert.equal(Object.hasOwn(config, 'youtubeClientId'), false);
  assert.deepEqual(config.conversationLog, { configured: true, tokenConfigured: true, parentPageId: 'parent-page', parentPageUrl: 'https://app.notion.com/p/parent-page' });
  assert.deepEqual(config.characterSettings, savedCharacterSettings);
  assert.equal(config.workspaces, undefined);
  await fetch(`http://127.0.0.1:${proxyPort}/api/avatar/config`);
  assert.equal(workspaceRegistrations, 0);
  for (const [id, workspaceId, mode] of [['english-coach', 'ws-1', 'chat'], ['game-partner', 'ws-2', 'chat'], ['xangi-assistant', 'default', 'agent']]) {
    const response = await fetch(`http://127.0.0.1:${proxyPort}/api/avatar/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, agentId: 'a1', workspaceId: 'wrong', localLlmMode: 'agent', instruction: `Dedicated ${id}` }) });
    assert.equal(response.status, 201);
    assert.equal(sessionBody.workspaceId, undefined);
    assert.equal(agentBody, null);
    assert.deepEqual(webCommandBodies, []);
  }
  webCommandBodies.length = 0;

  const characterSetting = await fetch(`http://127.0.0.1:${proxyPort}/api/avatar/settings/characters`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ customCharacters: [{ id: 'custom-2', name: '相棒' }], selectedCharacter: 'custom-2' }) });
  assert.equal(characterSetting.status, 200);
  assert.deepEqual(savedCharacterSettings, { customCharacters: [{ id: 'custom-2', name: '相棒' }], selectedCharacter: 'custom-2' });
  const invalidCharacterContentType = await fetch(`http://127.0.0.1:${proxyPort}/api/avatar/settings/characters`, { method: 'PUT', body: '{}' });
  assert.equal(invalidCharacterContentType.status, 415);
  const workspaceImage = await fetch(`http://127.0.0.1:${proxyPort}/api/avatar/workspace-image?agentId=a1&path=assets%2Favatar.png`);
  assert.equal(workspaceImage.status, 200);
  assert.equal(workspaceImage.headers.get('cache-control'), 'no-store');
  assert.equal(workspaceImage.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await workspaceImage.arrayBuffer()), pngImage);
  const otherWorkspace = join(captureRoot, 'other-workspace');
  await mkdir(join(otherWorkspace, 'assets'), { recursive: true });
  const otherImage = Buffer.concat([pngImage, Buffer.from('other-workspace')]);
  await writeFile(join(otherWorkspace, 'assets', 'avatar.png'), otherImage);
  presetWorkspaces.push({ id: 'agent-workspace', name: 'Agent workspace', path: otherWorkspace });
  agents[0].workspaceId = 'agent-workspace';
  const switchedImage = await fetch(`http://127.0.0.1:${proxyPort}/api/avatar/workspace-image?agentId=a1&workspaceId=default&path=assets%2Favatar.png`);
  assert.equal(switchedImage.status, 200);
  assert.deepEqual(Buffer.from(await switchedImage.arrayBuffer()), otherImage);
  agents[0].workspaceId = 'missing-workspace';
  assert.equal((await fetch(`http://127.0.0.1:${proxyPort}/api/avatar/workspace-image?agentId=a1&path=assets%2Favatar.png`)).status, 404);
  delete agents[0].workspaceId;
  assert.equal((await fetch(`http://127.0.0.1:${proxyPort}/api/avatar/workspace-image?agentId=deleted&path=assets%2Favatar.png`)).status, 404);
  assert.equal((await fetch(`http://127.0.0.1:${proxyPort}/api/avatar/workspace-image?workspaceId=default&path=assets%2Favatar.png`)).status, 400);
  const escapingImage = await fetch(`http://127.0.0.1:${proxyPort}/api/avatar/workspace-image?agentId=a1&path=..%2Foutside.png`);
  assert.equal(escapingImage.status, 403);
  const absoluteImage = await fetch(`http://127.0.0.1:${proxyPort}/api/avatar/workspace-image?agentId=a1&path=%2Fetc%2Fpasswd.png`);
  assert.equal(absoluteImage.status, 400);
  const unsupportedWorkspaceFile = await fetch(`http://127.0.0.1:${proxyPort}/api/avatar/workspace-image?agentId=a1&path=README.md`);
  assert.equal(unsupportedWorkspaceFile.status, 415);
  const disguisedWorkspaceFile = await fetch(`http://127.0.0.1:${proxyPort}/api/avatar/workspace-image?agentId=a1&path=assets%2Ffake.png`);
  assert.equal(disguisedWorkspaceFile.status, 415);
  const removedYouTubeSetting = await fetch(`http://127.0.0.1:${proxyPort}/api/avatar/settings/youtube`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(removedYouTubeSetting.status, 404);
  const notionSetting = await fetch(`http://127.0.0.1:${proxyPort}/api/avatar/settings/notion`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ parentPage: 'https://app.notion.com/p/new-parent' }) });
  assert.equal(notionSetting.status, 200);
  assert.equal((await notionSetting.json()).conversationLog.parentPageTitle, '会話ログ');
  assert.deepEqual(notionSettingsUpdates, ['https://app.notion.com/p/new-parent']);
  const session = await fetch(`http://127.0.0.1:${proxyPort}/api/avatar/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'test', agentId: 'a1', name: 'Test', backend: 'local-llm', model: 'qwen3.8-27b', workspaceId: 'default', localLlmMode: 'chat', instruction: 'Help', sessionKind: 'screen' }) });
  assert.deepEqual(await session.json(), { sessionId: 's-project', agentId: 'a1' });
  assert.equal(agentBody, null);
  assert.deepEqual(sessionBody, { agentId: 'a1' });
  assert.deepEqual(sessionPatchBody, { title: 'Avatar: 本体のAgent - 画面付き会話' });
  assert.deepEqual(agents, agentSnapshot);
  assert.deepEqual(webCommandBodies, []);
  webCommandBodies.length = 0;
  const defaultModeSession = await fetch(`http://127.0.0.1:${proxyPort}/api/avatar/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'test', agentId: 'a1', name: 'Default mode', backend: 'xangi', workspaceId: 'default', instruction: 'Help' }) });
  assert.equal(defaultModeSession.status, 201);
  assert.equal(agents.length, 1);
  assert.equal(agentBody, null);
  assert.equal((await defaultModeSession.json()).agentId, 'a1');
  assert.deepEqual(webCommandBodies, []);
  agents[0].name = '本体で変更した名前';
  agents[0].prompt = '本体で更新した指示';
  agents[0].model = 'model-b';
  agents[0].localLlmMode = 'chat';
  agents[0].localLlmReasoningEffort = 'low';
  const updatedSnapshot = structuredClone(agents);
  await Promise.all(Array.from({ length: 3 }, () => fetch(`http://127.0.0.1:${proxyPort}/api/avatar/session`, { method: 'POST', body: JSON.stringify({ agentId: 'a1', instruction: 'stale', model: 'stale', localLlmMode: 'agent', localLlmReasoningEffort: 'high' }) }).then(r => assert.equal(r.status, 201))));
  assert.deepEqual(agents, updatedSnapshot);
  assert.deepEqual(sessionPatchBody, { title: 'Avatar: 本体で変更した名前 - 会話' });
  assert.deepEqual(webCommandBodies, []);
  const previousSession = sessionBody;
  for (const agentId of ['', 'deleted']) {
    const invalid = await fetch(`http://127.0.0.1:${proxyPort}/api/avatar/session`, { method: 'POST', body: JSON.stringify({ agentId }) });
    assert.equal(invalid.status, 400);
    assert.match((await invalid.json()).error, /Agent/);
    assert.equal(sessionBody, previousSession);
  }
  assert.equal(agentBody, null);
  const sessionStatus = await fetch(`http://127.0.0.1:${proxyPort}/api/avatar/session/status?sessionId=s-project`).then((response) => response.json());
  assert.deepEqual(sessionStatus, { exists: true, lifecycle: 'open', modelExecution: { backend: 'local-llm', effectiveModel: 'observed-model', source: 'provider', observedModels: ['observed-model'] } });
  const closeSession = await fetch(`http://127.0.0.1:${proxyPort}/api/avatar/session/close`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: 's-project' }) });
  assert.equal(closeSession.status, 200);
  assert.deepEqual(closedSessionBody, { force: true });
  const message = await fetch(`http://127.0.0.1:${proxyPort}/api/avatar/message`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'hello' }),
  });
  assert.equal(message.status, 202);
  assert.equal((await message.json()).thread_id, 'web:s1');
  assert.deepEqual(JSON.parse(receivedBody), { text: 'hello' });

  const jpegFrame = Buffer.from([0xff, 0xd8, 0xff, 0x65, 0x6e, 0x64]);
  const frame = await fetch(`http://127.0.0.1:${proxyPort}/api/avatar/frame`, {
    method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: jpegFrame,
  });
  assert.equal(frame.status, 201);
  const { imagePath } = await frame.json();
  assert.equal(imagePath.startsWith(captureDir), true);
  assert.deepEqual(await readFile(imagePath), jpegFrame);
  const conversationLog = await fetch(`http://127.0.0.1:${proxyPort}/api/avatar/conversation-log`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: 's-project', imagePath, characterName: '相棒', spokenText: '次は？', responseText: '上へ。', recordedAt: '2026-09-16T08:01:00.000Z' }),
  });
  assert.equal(conversationLog.status, 201);
  assert.deepEqual(await conversationLog.json(), { ok: true, pageId: 'notion-page-1', pageUrl: 'https://notion.so/notion-page-1' });
  assert.equal(notionEntries[0].sessionId, 's-project');
  assert.equal(notionEntries[0].spokenText, '次は？');
  assert.deepEqual(notionEntries[0].image, jpegFrame);
  const escapingConversationLog = await fetch(`http://127.0.0.1:${proxyPort}/api/avatar/conversation-log`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: 's-project', imagePath: '/etc/passwd' }),
  });
  assert.equal(escapingConversationLog.status, 403);
  const unsupportedFrame = await fetch(`http://127.0.0.1:${proxyPort}/api/avatar/frame`, {
    method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'no',
  });
  assert.equal(unsupportedFrame.status, 415);

  const invalidOverlayState = await fetch(`http://127.0.0.1:${proxyPort}/api/avatar/overlay/state`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state: 'dancing' }),
  });
  assert.equal(invalidOverlayState.status, 400);
  const overlayUpdate = await fetch(`http://127.0.0.1:${proxyPort}/api/avatar/overlay/state`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state: 'speaking', detail: '話しています', text: '同期テスト', character: { name: 'テスト', imageClosed: '/closed.png', imageOpen: '/open.png' } }),
  });
  assert.equal(overlayUpdate.status, 200);
  const overlayState = await fetch(`http://127.0.0.1:${proxyPort}/api/avatar/overlay/state`).then((response) => response.json());
  assert.equal(overlayState.state, 'speaking');
  assert.equal(overlayState.text, '同期テスト');
  assert.deepEqual(overlayState.character, { name: 'テスト', imageClosed: '/closed.png', imageOpen: '/open.png' });
  const overlayController = new AbortController();
  const overlayEvents = await fetch(`http://127.0.0.1:${proxyPort}/api/avatar/overlay/events`, { signal: overlayController.signal });
  assert.equal(overlayEvents.status, 200);
  const overlayReader = overlayEvents.body.getReader();
  const overlayChunk = new TextDecoder().decode((await overlayReader.read()).value);
  assert.match(overlayChunk, /event: overlay\.state/);
  assert.match(overlayChunk, /同期テスト/);
  await overlayReader.cancel();
  overlayController.abort();

  const events = await fetch(`http://127.0.0.1:${proxyPort}/api/avatar/events`);
  assert.equal(events.status, 200);
  assert.match(await events.text(), /instance_id.*test/);
} finally {
  await new Promise((resolve) => proxy.close(resolve));
  await new Promise((resolve) => upstream.close(resolve));
  await rm(captureRoot, { recursive: true, force: true });
}

console.log('proxy integration tests passed');
