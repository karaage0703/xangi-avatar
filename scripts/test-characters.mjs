import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHARACTER_PRESETS, VOICE_PROVIDERS, buildCharacterPrompt, characterById, normalizeCharacter } from '../src/lib/characters.js';

assert.deepEqual(CHARACTER_PRESETS.map(({ id }) => id), ['xangi-assistant', 'english-coach', 'game-partner']);
for (const character of CHARACTER_PRESETS) {
  for (const key of ['name', 'role', 'stt', 'tts']) assert.ok(character[key]);
}
assert.deepEqual(CHARACTER_PRESETS.map(({ workspaceName }) => workspaceName), [undefined, undefined, undefined]);
assert.equal(characterById('missing').id, 'xangi-assistant');
assert.deepEqual(VOICE_PROVIDERS.stt.map(({ id }) => id), ['whisper', 'browser']);
assert.deepEqual(VOICE_PROVIDERS.tts.map(({ id }) => id), ['piper', 'voicevox', 'browser']);
assert.equal(normalizeCharacter({ conversationLog: true }).conversationLog, true);
assert.equal(normalizeCharacter({ conversationLog: 'true' }).conversationLog, false);
assert.equal(normalizeCharacter({ stt: 'whisper', tts: 'piper' }).stt, 'whisper');
assert.equal(normalizeCharacter({ stt: 'whisper', tts: 'piper' }).tts, 'piper');
assert.equal(normalizeCharacter({ stt: 'unknown', tts: 'unknown' }).stt, 'browser');
assert.equal(buildCharacterPrompt({ instruction: 'Do not inject', backend: 'codex' }, '  まとめて  '), 'まとめて');
assert.equal(buildCharacterPrompt({}, '  '), '');
assert.equal(normalizeCharacter({ agentId: 'a1', instruction: 'old', backend: 'old', model: 'old' }).instruction, undefined);
assert.equal(characterById().id, 'xangi-assistant');
assert.equal(new Set(CHARACTER_PRESETS.map(({ imageClosed }) => imageClosed)).size, 1);
for (const character of CHARACTER_PRESETS) {
  assert.equal(character.imageClosed, './assets/xangi-avatar/closed.png');
  assert.equal(character.imageOpen, './assets/xangi-avatar/open.png');
}
for (const role of ['english', 'game']) {
  for (const state of ['closed', 'open']) {
    const png = readFileSync(new URL(`../workspaces/${role}/assets/xangi-avatar/${state}.png`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png[25], 6, 'avatar must have an alpha channel');
  }
}
console.log('character preset tests passed');

for (const preset of CHARACTER_PRESETS) {
  const character = normalizeCharacter(preset);
  const prompt = buildCharacterPrompt(character, 'Hello');
  assert.equal(prompt, 'Hello');
}

assert.equal(normalizeCharacter({ workspaceId: 'stale', workspaceName: 'game' }).workspaceId, undefined);

for (const key of ['localLlmMode', 'localLlmReasoningEffort', 'effort']) assert.equal(normalizeCharacter({ [key]: 'stale' })[key], undefined);

const { characterSetupError } = await import('../src/lib/characters.js');
assert.match(characterSetupError(CHARACTER_PRESETS[0]), /キャラクター.*未設定/);
assert.match(characterSetupError({ id: 'custom-test', agentId: '' }), /キャラクター.*未設定/);
assert.doesNotMatch(characterSetupError({ id: 'custom-test' }), /複製/);
assert.equal(characterSetupError({ agentId: 'xangi:default' }), '');

const { mergeCharacters } = await import('../src/lib/characters.js');
const merged = mergeCharacters([{ id: 'xangi-assistant', agentId: 'xangi:default', tts: 'voicevox' }, { id: 'custom-example', agentId: 'other' }]);
assert.equal(merged.filter(c => c.id === 'xangi-assistant').length, 1);
assert.equal(merged.find(c => c.id === 'xangi-assistant').agentId, 'xangi:default');
assert.equal(merged.find(c => c.id === 'xangi-assistant').tts, 'voicevox');
assert.equal(merged.length, CHARACTER_PRESETS.length + 1);
