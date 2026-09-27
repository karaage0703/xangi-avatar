export const CHARACTER_PRESETS = Object.freeze([
  {
    id: 'xangi-assistant', name: 'xangi', role: '優秀なアシスタント', language: 'ja-JP',
    agentId: '', stt: 'whisper', tts: 'piper',
    imageClosed: './assets/avatar-closed.png', imageOpen: './assets/avatar-open.png',
  },
  {
    id: 'english-coach', name: '英会話コーチ', role: '会話を止めない英語コーチ', language: 'en-US',
    agentId: '', stt: 'whisper', tts: 'piper',
    imageClosed: 'assets/xangi-avatar/english/closed.png', imageOpen: 'assets/xangi-avatar/english/open.png',
  },
  {
    id: 'game-partner', name: 'ゲーム実況パートナー', role: 'プレイを邪魔しない実況相棒', language: 'ja-JP',
    agentId: '', stt: 'whisper', tts: 'piper',
    imageClosed: 'assets/xangi-avatar/game/closed.png', imageOpen: 'assets/xangi-avatar/game/open.png',
  },
]);

export const VOICE_PROVIDERS = Object.freeze({
  stt: Object.freeze([{ id: 'whisper', label: 'Whisper（サーバー）' }, { id: 'browser', label: 'ブラウザ音声認識' }]),
  tts: Object.freeze([{ id: 'piper', label: 'Piper（サーバー）' }, { id: 'voicevox', label: 'VOICEVOX（サーバー）' }, { id: 'browser', label: 'ブラウザ読み上げ' }]),
});

export function normalizeCharacter(character) {
  return {
    ...Object.fromEntries(Object.entries(character).filter(([key]) => ['id', 'agentId', 'name', 'role', 'language', 'stt', 'tts', 'imageClosed', 'imageOpen', 'conversationLog'].includes(key))),
    agentId: String(character.agentId || '').trim(),
    conversationLog: character.conversationLog === true,
    stt: VOICE_PROVIDERS.stt.some(({ id }) => id === character.stt) ? character.stt : 'browser',
    tts: VOICE_PROVIDERS.tts.some(({ id }) => id === character.tts) ? character.tts : 'browser',
  };
}

export function characterById(id) {
  return normalizeCharacter(CHARACTER_PRESETS.find((character) => character.id === id) || CHARACTER_PRESETS[0]);
}

export function buildCharacterPrompt(character, text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';
  return trimmed;
}
