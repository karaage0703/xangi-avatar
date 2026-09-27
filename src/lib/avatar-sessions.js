const SESSION_KEY_PREFIX = 'xangi-avatar:host-agent-session:';

export function sessionStorageKey(characterId) {
  return `${SESSION_KEY_PREFIX}${characterId}`;
}
export function loadCharacterSession(storage, characterId) {
  return storage.getItem(sessionStorageKey(characterId)) || '';
}
export function saveCharacterSession(storage, characterId, sessionId) {
  const key = sessionStorageKey(characterId);
  if (sessionId) storage.setItem(key, sessionId);
  else storage.removeItem(key);
}
export function clearCharacterConversation(storage, characterId) {
  saveCharacterSession(storage, characterId, '');
}
