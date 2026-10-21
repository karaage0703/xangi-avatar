import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCharacterSettingsStore } from '../server/character-settings.mjs';

const root = await mkdtemp(join(tmpdir(), 'xangi-avatar-character-settings-'));
const settingsFile = join(root, 'nested', 'character-settings.json');
const store = createCharacterSettingsStore({ settingsFile });

try {
  assert.deepEqual(await store.getSettings(), { customCharacters: [], selectedCharacter: '' });
  const saved = await store.saveSettings({
    customCharacters: [{
      id: 'custom-1', agentId: 'a1', name: 'borot', role: '相棒', backend: 'local-llm', workspaceId: 'workspace-1',
      localLlmMode: 'chat', conversationLog: true, stt: 'whisper', tts: 'voicevox', language: 'ja-JP',
      instruction: '簡潔に話す', imageClosed: 'assets/closed.png', imageOpen: 'assets/open.png', ignored: 'drop-me',
    }],
    selectedCharacter: 'custom-1',
  });
  assert.equal(saved.customCharacters[0].agentId, 'a1');
  for (const field of ['name', 'role', 'instruction', 'backend', 'model', 'workspaceId', 'workspaceName', 'localLlmMode', 'localLlmReasoningEffort', 'effort']) assert.equal(Object.hasOwn(saved.customCharacters[0], field), false);
  assert.equal(saved.customCharacters[0].conversationLog, true);
  assert.equal(Object.hasOwn(saved.customCharacters[0], 'ignored'), false);
  assert.equal(saved.selectedCharacter, 'custom-1');
  assert.deepEqual(await store.getSettings(), saved);
  assert.equal((await readFile(settingsFile, 'utf8')).endsWith('\n'), true);
  assert.equal((await store.saveSettings({ customCharacters: saved.customCharacters, selectedCharacter: 'game-partner' })).selectedCharacter, 'game-partner');
  const presetSaved = await store.saveSettings({ customCharacters: [...saved.customCharacters, { id: 'xangi-assistant', agentId: 'xangi:default', stt: 'browser', tts: 'voicevox', imageClosed: 'custom/closed.png' }], selectedCharacter: 'xangi-assistant' });
  const reopened = createCharacterSettingsStore({ settingsFile });
  assert.deepEqual(await reopened.getSettings(), presetSaved);
  assert.equal(presetSaved.customCharacters.length, 2);
  assert.equal(presetSaved.customCharacters[1].tts, 'voicevox');
  assert.equal(presetSaved.customCharacters[1].imageClosed, 'custom/closed.png');
  assert.equal(presetSaved.customCharacters[1].imageOpen, './assets/xangi-avatar/open.png');
  const defaults = await store.saveSettings({ customCharacters: [{ id: 'custom-default', agentId: 'a1', imageClosed: '', imageOpen: '' }] });
  assert.equal(defaults.customCharacters[0].imageClosed, './assets/xangi-avatar/closed.png');
  assert.equal(defaults.customCharacters[0].imageOpen, './assets/xangi-avatar/open.png');
  assert.deepEqual(await reopened.getSettings(), defaults);
  await assert.rejects(() => store.saveSettings({ customCharacters: [{ id: 'preset', name: 'invalid' }] }), /custom-\*/);
  await assert.rejects(() => store.saveSettings({ customCharacters: [{ id: 'custom-1', agentId: 'a1', name: 'one' }, { id: 'custom-1', agentId: 'a1', name: 'two' }] }), /unique/);
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log('character settings tests passed');
