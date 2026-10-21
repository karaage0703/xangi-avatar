import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Execute the actual submission function so undefined runtime references fail.
const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const start = source.indexOf('async function sendMessage(');
const end = source.indexOf('\nasync function sendUserMessage(', start);
const calls = [];
const context = vm.createContext({
  handsFree: { pause() {} }, showError() {}, stopSpeaking() {},
  setState() {}, showBubble() {},
  async ensureAvatarSession(kind) { calls.push(['session', kind]); },
  beginSpeech() { calls.push(['speech']); },
  async fetch(url, options) {
    calls.push(['message', url, JSON.parse(options.body)]);
    return { ok: true, async json() { return { session_id: 's1', thread_id: 'web:s1', turn_id: 't1' }; } };
  },
  activeCharacter: () => ({ agentId: 'a1', name: 'test', conversationLog: true }),
  buildCharacterPrompt: (_character, text) => text,
  saveCharacterSession() {}, localStorage: {}, mode: 'test', appSessionId: 's1',
  activeTurnId: '', activeThreadId: '', activeScreenStartedAt: '',
  responseText: '', overlayResponseText: '', visualTurnIds: new Set(), visualTurnRecords: new Map(),
});
vm.runInContext(source.slice(start, end), context);
await context.sendMessage('hello');
assert.deepEqual(calls.map(call => call[0]), ['session', 'speech', 'message']);
assert.equal(calls[2][1], 'api/avatar/message');
assert.equal(calls[2][2].text, 'hello');
calls.length = 0;
await context.sendMessage('screen', { turnKind: 'screen', screenContext: { frame: 'test' } });
assert.equal(calls[0][1], 'screen');
assert.equal(context.visualTurnRecords.get('t1').frame, 'test');
calls.length = 0;
await context.sendMessage('   ');
assert.equal(calls.length, 0);
console.log('text and screen message submission, speech setup and empty input passed');
