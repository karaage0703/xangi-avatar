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
  await assert.rejects(() => store.saveSettings({ customCharacters: [{ id: 'preset', name: 'invalid' }] }), /custom-\*/);
  await assert.rejects(() => store.saveSettings({ customCharacters: [{ id: 'custom-1', agentId: 'a1', name: 'one' }, { id: 'custom-1', agentId: 'a1', name: 'two' }] }), /unique/);
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log('character settings tests passed');
