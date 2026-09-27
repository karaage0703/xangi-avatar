import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHARACTER_PRESETS, normalizeCharacter } from '../src/lib/characters.js';

const DEFAULT_SETTINGS_FILE = fileURLToPath(new URL('../.runtime/character-settings.json', import.meta.url));
const MAX_CHARACTERS = 50;
const MAX_TEXT_LENGTH = 8_000;

function text(value, length = MAX_TEXT_LENGTH) {
  return String(value || '').trim().slice(0, length);
}

function normalizeCustomCharacter(input) {
  const character = normalizeCharacter({
    id: text(input?.id, 100),
    agentId: text(input?.agentId, 200),
    conversationLog: input?.conversationLog === true,
    stt: text(input?.stt, 20),
    tts: text(input?.tts, 20),
    language: text(input?.language, 20) || 'ja-JP',
    imageClosed: text(input?.imageClosed, 4_096) || './assets/avatar-closed.png',
    imageOpen: text(input?.imageOpen, 4_096) || './assets/avatar-open.png',
  });
  if (!character.id.startsWith('custom-')) {
    const error = new Error('custom character requires a custom-* id');
    error.statusCode = 400;
    throw error;
  }
  return character;
}

function normalizeSettings(input) {
  if (!Array.isArray(input?.customCharacters) || input.customCharacters.length > MAX_CHARACTERS) {
    const error = new Error(`customCharacters must be an array of at most ${MAX_CHARACTERS} items`);
    error.statusCode = 400;
    throw error;
  }
  const customCharacters = input.customCharacters.map(normalizeCustomCharacter);
  const uniqueIds = new Set(customCharacters.map(({ id }) => id));
  if (uniqueIds.size !== customCharacters.length) {
    const error = new Error('custom character ids must be unique');
    error.statusCode = 400;
    throw error;
  }
  const requestedCharacter = text(input.selectedCharacter, 100);
  const selectableIds = new Set([...CHARACTER_PRESETS.map(({ id }) => id), ...uniqueIds]);
  return {
    customCharacters,
    selectedCharacter: selectableIds.has(requestedCharacter) ? requestedCharacter : '',
  };
}

export function createCharacterSettingsStore({
  settingsFile = process.env.AVATAR_CHARACTER_SETTINGS_FILE || DEFAULT_SETTINGS_FILE,
} = {}) {
  async function getSettings() {
    try {
      return normalizeSettings(JSON.parse(await readFile(settingsFile, 'utf8')));
    } catch (error) {
      if (error?.code === 'ENOENT') return { customCharacters: [], selectedCharacter: '' };
      throw error;
    }
  }

  async function saveSettings(input) {
    const settings = normalizeSettings(input);
    await mkdir(dirname(settingsFile), { recursive: true, mode: 0o700 });
    const temporaryFile = `${settingsFile}.${process.pid}-${randomUUID()}.tmp`;
    await writeFile(temporaryFile, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
    await rename(temporaryFile, settingsFile);
    return settings;
  }

  return { getSettings, saveSettings };
}
