import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { forwardVoice, voiceStatus } from './voice.mjs';
import { createNotionConversationLog } from './notion.mjs';
import { createCharacterSettingsStore } from './character-settings.mjs';

const MAX_BODY_BYTES = 32 * 1024 * 1024;
const MAX_FRAME_BYTES = 5 * 1024 * 1024;
const DEFAULT_CAPTURE_DIR = fileURLToPath(new URL('../.runtime/captures/', import.meta.url));
const OVERLAY_STATES = new Set(['idle', 'listening', 'thinking', 'speaking', 'error']);
const WORKSPACE_IMAGE_TYPES = Object.freeze({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' });
const MAX_WORKSPACE_IMAGE_BYTES = 20 * 1024 * 1024;

function matchesImageSignature(buffer, contentType) {
  if (contentType === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (contentType === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (contentType === 'image/gif') return ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'));
  if (contentType === 'image/webp') return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  return false;
}

function normalizeOverlayState(input, revision) {
  const state = String(input?.state || 'idle');
  if (!OVERLAY_STATES.has(state)) {
    const error = new Error('invalid overlay state');
    error.statusCode = 400;
    throw error;
  }
  const character = input?.character && typeof input.character === 'object' ? input.character : {};
  return {
    state,
    detail: String(input?.detail || '').slice(0, 200),
    text: String(input?.text || '').slice(0, 8_000),
    character: {
      name: String(character.name || '').slice(0, 80),
      imageClosed: String(character.imageClosed || '').slice(0, 4_096),
      imageOpen: String(character.imageOpen || '').slice(0, 4_096),
    },
    revision,
    updatedAt: Date.now(),
  };
}

function writeOverlayEvent(response, state) {
  response.write(`event: overlay.state\ndata: ${JSON.stringify(state)}\n\n`);
}

export function normalizeXangiUrl(value) {
  const url = new URL(String(value || 'http://127.0.0.1:18888'));
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('XANGI_URL must use http or https');
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

async function readBody(request, limit = MAX_BODY_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error('request body too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function removeExpiredCaptures(directory, now = Date.now()) {
  const names = await readdir(directory).catch(() => []);
  await Promise.all(names.filter((name) => ['.jpg', '.png'].includes(extname(name))).map(async (name) => {
    const path = join(directory, name);
    const info = await stat(path).catch(() => null);
    if (info && now - info.mtimeMs > 10 * 60_000) await unlink(path).catch(() => {});
  }));
}

function copyResponseHeaders(upstream, response, contentType) {
  response.writeHead(upstream.status, {
    'content-type': upstream.headers.get('content-type') || contentType,
    'cache-control': upstream.headers.get('cache-control') || 'no-store',
    'x-accel-buffering': upstream.headers.get('x-accel-buffering') || 'no',
  });
}

export function createAvatarProxy({
  xangiUrl = process.env.XANGI_URL,
  token = process.env.XANGI_TOKEN || '',
  fetchImpl = globalThis.fetch,
  captureDir = process.env.AVATAR_CAPTURE_DIR || DEFAULT_CAPTURE_DIR,
  notionLog = createNotionConversationLog({ fetchImpl }),
  characterSettings = createCharacterSettingsStore(),
} = {}) {
  const baseUrl = normalizeXangiUrl(xangiUrl);
  const frameDirectory = resolve(captureDir);
  const authHeaders = token ? { authorization: `Bearer ${token}` } : {};
  let overlayRevision = 0;
  let overlayState = normalizeOverlayState({}, overlayRevision);
  const overlaySubscribers = new Set();

  function publishOverlayState(input) {
    overlayState = normalizeOverlayState(input, ++overlayRevision);
    for (const subscriber of overlaySubscribers) {
      if (subscriber.destroyed) overlaySubscribers.delete(subscriber);
      else {
        try { writeOverlayEvent(subscriber, overlayState); }
        catch { overlaySubscribers.delete(subscriber); }
      }
    }
    return overlayState;
  }

  async function xangiJson(path, init = {}) {
    const upstream = await fetchImpl(`${baseUrl}${path}`, { ...init, headers: { 'content-type': 'application/json', ...authHeaders, ...(init.headers || {}) } });
    const body = await upstream.json().catch(() => ({}));
    if (!upstream.ok) throw new Error(body.error || `xangi HTTP ${upstream.status}`);
    return body;
  }

  return async function avatarProxy(request, response, next = () => {}) {
    const url = new URL(request.url || '/', 'http://avatar.local');
    try {
      if (request.method === 'POST' && url.pathname === '/api/avatar/overlay/state') {
        if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
          const error = new Error('content-type must be application/json');
          error.statusCode = 415;
          throw error;
        }
        const input = JSON.parse((await readBody(request, 16 * 1024)).toString('utf8') || '{}');
        const state = publishOverlayState(input);
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        response.end(JSON.stringify(state));
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/avatar/overlay/state') {
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        response.end(JSON.stringify(overlayState));
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/avatar/overlay/events') {
        response.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-store',
          connection: 'keep-alive',
          'x-accel-buffering': 'no',
        });
        overlaySubscribers.add(response);
        writeOverlayEvent(response, overlayState);
        const heartbeat = setInterval(() => {
          if (response.destroyed) overlaySubscribers.delete(response);
          else {
            try { response.write(': keepalive\n\n'); }
            catch { overlaySubscribers.delete(response); }
          }
        }, 15_000);
        request.once('close', () => {
          clearInterval(heartbeat);
          overlaySubscribers.delete(response);
        });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/avatar/config') {
        const [agentResult, voice, savedCharacterSettings] = await Promise.all([xangiJson('/api/agents'), voiceStatus(fetchImpl), characterSettings.getSettings()]);
        const conversationLog = notionLog.getSettings?.() || { configured: notionLog.configured };
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        response.end(JSON.stringify({ xangiUrl: baseUrl, voiceSecureContextRequired: true, voice, agents: (agentResult.agents || []).map(({ id, name, role, backend, model }) => ({ id, name, role, backend, model })), conversationLog, characterSettings: savedCharacterSettings }));
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/avatar/agents') {
        const { agents } = await xangiJson('/api/agents');
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        response.end(JSON.stringify({ agents: (agents || []).map(({ id, name, role, backend, model }) => ({ id, name, role, backend, model })) }));
        return;
      }

      if (request.method === 'PUT' && url.pathname === '/api/avatar/settings/characters') {
        if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
          const error = new Error('content-type must be application/json');
          error.statusCode = 415;
          throw error;
        }
        const input = JSON.parse((await readBody(request, 512 * 1024)).toString('utf8') || '{}');
        const savedCharacterSettings = await characterSettings.saveSettings(input);
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        response.end(JSON.stringify({ ok: true, characterSettings: savedCharacterSettings }));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/avatar/settings/notion') {
        if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
          const error = new Error('content-type must be application/json');
          error.statusCode = 415;
          throw error;
        }
        if (typeof notionLog.configureParentPage !== 'function') {
          const error = new Error('Notion settings are unavailable');
          error.statusCode = 503;
          throw error;
        }
        const input = JSON.parse((await readBody(request, 16 * 1024)).toString('utf8') || '{}');
        const conversationLog = await notionLog.configureParentPage(input.parentPage);
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        response.end(JSON.stringify({ ok: true, conversationLog }));
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/avatar/workspace-image') {
        const agentId = String(url.searchParams.get('agentId') || '').trim();
        const imagePath = String(url.searchParams.get('path') || '').trim();
        if (!agentId || !imagePath || isAbsolute(imagePath)) {
          const error = new Error('agentId and a relative image path are required');
          error.statusCode = 400;
          throw error;
        }
        const contentType = WORKSPACE_IMAGE_TYPES[extname(imagePath).toLowerCase()];
        if (!contentType) {
          const error = new Error('workspace image must be PNG, JPEG, WebP, or GIF');
          error.statusCode = 415;
          throw error;
        }
        const { agents = [] } = await xangiJson('/api/agents');
        const agent = agents.find(({ id }) => id === agentId);
        if (!agent) throw Object.assign(new Error('選択したAgentが見つかりません。'), { statusCode: 404 });
        const workspaceId = agent.workspaceId || 'default';
        const { workspaces = [] } = await xangiJson('/api/workspaces');
        const workspace = workspaces.find(({ id }) => String(id) === workspaceId);
        if (!workspace?.path) {
          const error = new Error('workspace not found');
          error.statusCode = 404;
          throw error;
        }
        let workspaceRoot;
        let resolvedImage;
        try {
          workspaceRoot = await realpath(resolve(String(workspace.path)));
          resolvedImage = await realpath(resolve(workspaceRoot, imagePath));
        } catch (cause) {
          const error = new Error('workspace image not found', { cause });
          error.statusCode = 404;
          throw error;
        }
        const workspaceRelativePath = relative(workspaceRoot, resolvedImage);
        if (!workspaceRelativePath || workspaceRelativePath === '..' || workspaceRelativePath.startsWith(`..${sep}`) || isAbsolute(workspaceRelativePath)) {
          const error = new Error('workspace image path escapes the workspace');
          error.statusCode = 403;
          throw error;
        }
        const imageInfo = await stat(resolvedImage);
        if (!imageInfo.isFile()) {
          const error = new Error('workspace image is not a file');
          error.statusCode = 404;
          throw error;
        }
        if (imageInfo.size > MAX_WORKSPACE_IMAGE_BYTES) {
          const error = new Error('workspace image is too large');
          error.statusCode = 413;
          throw error;
        }
        const image = await readFile(resolvedImage);
        if (!matchesImageSignature(image, contentType)) {
          const error = new Error('workspace file content does not match its image extension');
          error.statusCode = 415;
          throw error;
        }
        response.writeHead(200, {
          'content-type': contentType,
          'content-length': imageInfo.size,
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        });
        response.end(image);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/avatar/stt') {
        const body = await readBody(request);
        await forwardVoice(request, response, `/stt?language=${encodeURIComponent(url.searchParams.get('language') || 'ja-JP')}`, { fetchImpl, body, contentType: request.headers['content-type'] });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/avatar/tts') {
        const body = await readBody(request);
        await forwardVoice(request, response, '/tts', { fetchImpl, body, contentType: 'application/json' });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/avatar/frame') {
        const contentType = String(request.headers['content-type'] || '').split(';')[0].trim();
        const extension = contentType === 'image/png' ? '.png' : contentType === 'image/jpeg' ? '.jpg' : '';
        if (!extension) {
          response.writeHead(415, { 'content-type': 'application/json; charset=utf-8' });
          response.end(JSON.stringify({ error: 'frame must be image/jpeg or image/png' }));
          return;
        }
        const body = await readBody(request, MAX_FRAME_BYTES);
        if (!body.length) throw new Error('frame is empty');
        await mkdir(frameDirectory, { recursive: true, mode: 0o700 });
        const imagePath = join(frameDirectory, `${Date.now()}-${randomUUID()}${extension}`);
        await writeFile(imagePath, body, { mode: 0o600 });
        void removeExpiredCaptures(frameDirectory);
        response.writeHead(201, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        response.end(JSON.stringify({ imagePath }));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/avatar/conversation-log') {
        if (!notionLog.configured) {
          const error = new Error('Notion conversation log is not configured');
          error.statusCode = 503;
          throw error;
        }
        const input = JSON.parse((await readBody(request, 32 * 1024)).toString('utf8') || '{}');
        const sessionId = String(input.sessionId || '').trim();
        const imagePath = String(input.imagePath || '').trim();
        if (!sessionId || !imagePath || !isAbsolute(imagePath)) {
          const error = new Error('sessionId and an absolute capture imagePath are required');
          error.statusCode = 400;
          throw error;
        }
        let resolvedImage;
        try {
          resolvedImage = await realpath(imagePath);
        } catch (cause) {
          const error = new Error('capture image not found', { cause });
          error.statusCode = 404;
          throw error;
        }
        await mkdir(frameDirectory, { recursive: true, mode: 0o700 });
        const resolvedFrameDirectory = await realpath(frameDirectory);
        const captureRelativePath = relative(resolvedFrameDirectory, resolvedImage);
        if (!captureRelativePath || captureRelativePath === '..' || captureRelativePath.startsWith(`..${sep}`) || isAbsolute(captureRelativePath)) {
          const error = new Error('capture imagePath escapes the capture directory');
          error.statusCode = 403;
          throw error;
        }
        const mimeType = WORKSPACE_IMAGE_TYPES[extname(resolvedImage).toLowerCase()];
        if (!['image/jpeg', 'image/png'].includes(mimeType)) {
          const error = new Error('conversation log image must be JPEG or PNG');
          error.statusCode = 415;
          throw error;
        }
        const imageInfo = await stat(resolvedImage);
        if (!imageInfo.isFile() || imageInfo.size > MAX_FRAME_BYTES) {
          const error = new Error('conversation log image is invalid or too large');
          error.statusCode = imageInfo.size > MAX_FRAME_BYTES ? 413 : 404;
          throw error;
        }
        const image = await readFile(resolvedImage);
        if (!matchesImageSignature(image, mimeType)) {
          const error = new Error('capture file content does not match its image extension');
          error.statusCode = 415;
          throw error;
        }
        const result = await notionLog.appendEntry({
          sessionId,
          characterName: String(input.characterName || '').slice(0, 80),
          startedAt: String(input.startedAt || '').slice(0, 64),
          recordedAt: String(input.recordedAt || '').slice(0, 64),
          spokenText: String(input.spokenText || '').slice(0, 2_000),
          responseText: String(input.responseText || '').slice(0, 2_000),
          image,
          filename: basename(resolvedImage),
          mimeType,
        });
        response.writeHead(201, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        response.end(JSON.stringify({ ok: true, ...result }));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/avatar/session') {
        const input = JSON.parse((await readBody(request)).toString('utf8') || '{}');
        const agentId = String(input.agentId || '').trim();
        if (!agentId) throw Object.assign(new Error('キャラクター設定で本体のAgentを選択してください。'), { statusCode: 400 });
        const { agents } = await xangiJson('/api/agents');
        const agent = agents.find(({ id }) => id === agentId);
        if (!agent) throw Object.assign(new Error('選択したAgentが見つかりません。キャラクター設定で選び直してください。'), { statusCode: 400 });
        const characterName = agent.name;
        const session = await xangiJson('/api/sessions', { method: 'POST', body: JSON.stringify({ agentId }) });
        const sessionKind = input.sessionKind === 'screen' ? '画面付き会話' : '会話';
        const title = `Avatar: ${characterName} - ${sessionKind}`;
        await xangiJson(`/api/sessions/${encodeURIComponent(session.sessionId)}`, { method: 'PATCH', body: JSON.stringify({ title }) });
        response.writeHead(201, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        response.end(JSON.stringify({ sessionId: session.sessionId, agentId }));
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/avatar/session/status') {
        const sessionId = String(url.searchParams.get('sessionId') || '').trim();
        if (!sessionId) {
          response.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
          response.end(JSON.stringify({ error: 'sessionId is required' }));
          return;
        }
        const upstream = await fetchImpl(`${baseUrl}/api/sessions/${encodeURIComponent(sessionId)}?limit=1`, { headers: authHeaders });
        const result = await upstream.json().catch(() => ({}));
        if (upstream.status === 404) {
          response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
          response.end(JSON.stringify({ exists: false, lifecycle: 'missing' }));
          return;
        }
        if (!upstream.ok) throw new Error(result.error || `xangi HTTP ${upstream.status}`);
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        response.end(JSON.stringify({ exists: true, lifecycle: result.lifecycle || 'open', modelExecution: result.modelExecution || null }));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/avatar/session/close') {
        const input = JSON.parse((await readBody(request)).toString('utf8') || '{}');
        const sessionId = String(input.sessionId || '').trim();
        if (!sessionId) {
          response.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
          response.end(JSON.stringify({ error: 'sessionId is required' }));
          return;
        }
        await xangiJson(`/api/sessions/${encodeURIComponent(sessionId)}/close`, { method: 'POST', body: JSON.stringify({ force: true }) });
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        response.end(JSON.stringify({ ok: true, sessionId }));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/avatar/message') {
        const body = await readBody(request);
        const upstream = await fetchImpl(`${baseUrl}/api/device/inbox`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...authHeaders },
          body,
        });
        copyResponseHeaders(upstream, response, 'application/json; charset=utf-8');
        response.end(Buffer.from(await upstream.arrayBuffer()));
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/avatar/events') {
        const threadId = url.searchParams.get('thread_id');
        const upstreamUrl = new URL(`${baseUrl}/api/events/stream`);
        if (threadId) upstreamUrl.searchParams.set('thread_id', threadId);
        const controller = new AbortController();
        response.once('close', () => controller.abort());
        const upstream = await fetchImpl(upstreamUrl, { headers: authHeaders, signal: controller.signal });
        copyResponseHeaders(upstream, response, 'text/event-stream; charset=utf-8');
        if (!upstream.body) return response.end();
        const reader = upstream.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          response.write(Buffer.from(value));
        }
        response.end();
        return;
      }

      next();
    } catch (error) {
      if (error?.name === 'AbortError' || response.destroyed) return;
      if (response.headersSent) return response.destroy(error);
      const status = error?.statusCode || (error?.message === 'request body too large' ? 413 : error?.message === 'frame is empty' ? 400 : 502);
      response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'xangi proxy failed' }));
    }
  };
}
