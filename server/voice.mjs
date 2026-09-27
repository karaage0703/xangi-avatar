import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const voiceRoot = resolve(process.env.AVATAR_VOICE_ROOT || `${repoRoot}/.voice`);
const python = resolve(process.env.AVATAR_VOICE_PYTHON || `${voiceRoot}/venv/bin/python`);
const workerFile = resolve(fileURLToPath(new URL('./voice-worker.py', import.meta.url)));
const voiceUrl = process.env.AVATAR_VOICE_URL || `http://127.0.0.1:${process.env.AVATAR_VOICE_PORT || 4174}`;
let worker = null;
let starting = null;

export function voiceConfigured() {
  return Boolean(process.env.AVATAR_VOICE_URL || existsSync(python));
}

async function health(fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(`${voiceUrl}/health`, { signal: AbortSignal.timeout(1200) });
  if (!response.ok) throw new Error(`voice worker HTTP ${response.status}`);
  return response.json();
}

async function ensureVoiceWorker(fetchImpl = globalThis.fetch) {
  try { return await health(fetchImpl); } catch {}
  if (process.env.AVATAR_VOICE_URL) throw new Error('音声サーバーへ接続できません。');
  if (!existsSync(python)) throw new Error('サーバー音声が未セットアップです。npm run setup:voice を実行してください。');
  if (!starting) {
    starting = new Promise((resolveStart, rejectStart) => {
      worker = spawn(python, [workerFile], { cwd: repoRoot, env: { ...process.env, AVATAR_VOICE_ROOT: voiceRoot }, stdio: ['ignore', 'pipe', 'pipe'] });
      worker.stdout.on('data', (data) => process.stdout.write(data));
      worker.stderr.on('data', (data) => process.stderr.write(data));
      worker.once('exit', (code) => { worker = null; starting = null; if (code) console.error(`voice worker exited: ${code}`); });
      worker.once('error', rejectStart);
      const deadline = Date.now() + 15_000;
      const poll = async () => {
        try { resolveStart(await health(fetchImpl)); }
        catch (error) { if (Date.now() >= deadline) rejectStart(error); else setTimeout(poll, 150); }
      };
      poll();
    }).finally(() => { starting = null; });
  }
  return starting;
}

export async function voiceStatus(fetchImpl = globalThis.fetch) {
  if (!voiceConfigured()) return { configured: false, whisper: false, piper: false, voicevox: false };
  try { return { configured: true, ...(await health(fetchImpl)) }; }
  catch { return { configured: true, whisper: true, piper: existsSync(`${voiceRoot}/piper/PiperPlus.Cli`) && existsSync(`${voiceRoot}/models/tsukuyomi-chan-6lang-fp16.onnx`), voicevox: true, sleeping: true }; }
}

export async function forwardVoice(request, response, path, { fetchImpl = globalThis.fetch, body, contentType } = {}) {
  await ensureVoiceWorker(fetchImpl);
  const upstream = await fetchImpl(`${voiceUrl}${path}`, { method: 'POST', headers: contentType ? { 'content-type': contentType } : {}, body });
  const data = Buffer.from(await upstream.arrayBuffer());
  response.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') || 'application/octet-stream', 'cache-control': 'no-store' });
  response.end(data);
}

export function closeVoiceWorker() {
  if (worker && !worker.killed) worker.kill('SIGTERM');
}
