import { createCharacterImageLoader } from './lib/character-image.js';
import { formatModelExecution } from './lib/model-execution.js';
import { CHARACTER_PRESETS, VOICE_PROVIDERS, buildCharacterPrompt, characterById, normalizeCharacter } from './lib/characters.js';
import { HandsFree } from './lib/hands-free.js';
import { ScreenConversation, buildScreenConversationPrompt } from './lib/screen-conversation.js';
import { clearCharacterConversation, loadCharacterSession, saveCharacterSession } from './lib/avatar-sessions.js';
import { listAudioInputs, openAudioInput } from './lib/audio-input.js';
import { splitBubblePages } from './lib/bubble-pages.js';
import { assessTranscript } from './lib/transcript-quality.js';
import { StreamingSpeech } from './lib/streaming-speech.js';
import { ServerAudioPlayback } from './lib/server-audio-playback.js';
import bundledAvatarClosed from './assets/avatar-closed.png';
import bundledAvatarOpen from './assets/avatar-open.png';
import englishClosed from '../workspaces/english/assets/xangi-avatar/english/closed.png';
import englishOpen from '../workspaces/english/assets/xangi-avatar/english/open.png';
import gameClosed from '../workspaces/game/assets/xangi-avatar/game/closed.png';
import gameOpen from '../workspaces/game/assets/xangi-avatar/game/open.png';
const presetImages = {
  'assets/xangi-avatar/assistant/closed.png': bundledAvatarClosed,
  'assets/xangi-avatar/assistant/open.png': bundledAvatarOpen,
  'assets/xangi-avatar/english/closed.png': englishClosed,
  'assets/xangi-avatar/english/open.png': englishOpen,
  'assets/xangi-avatar/game/closed.png': gameClosed,
  'assets/xangi-avatar/game/open.png': gameOpen,
};

const $ = (id) => document.getElementById(id);
const elements = {
  avatar: $('avatar'), bubble: $('bubble'), bubbleText: $('bubbleText'), bubblePage: $('bubblePage'), stateBadge: $('stateBadge'),
  connection: $('connectionLabel'), mic: $('micButton'), micLabel: $('micLabel'), form: $('messageForm'),
  input: $('messageInput'), mode: $('modeSelect'), error: $('errorMessage'), settings: $('settingsDialog'),
  settingsButton: $('settingsButton'), restoreControls: $('restoreControlsButton'),
  audioInput: $('audioInputSelect'), audioInputStatus: $('audioInputStatus'), handsFreeStatus: $('handsFreeStatus'), microphoneMute: $('microphoneMuteButton'),
  notionLogging: $('notionLoggingToggle'), notionParentPage: $('notionParentPage'), saveNotionSettings: $('saveNotionSettingsButton'), notionSettingsStatus: $('notionSettingsStatus'),
  background: $('backgroundSelect'), controls: $('controlsToggle'), voice: $('voiceButton'), voiceLabel: $('voiceLabel'),
  screenConversation: $('screenConversationButton'), screenConversationStatus: $('screenConversationStatus'),
  newConversation: $('newConversationButton'),
  characterDialog: $('characterDialog'), characterForm: $('characterForm'), characterSettings: $('characterSettingsButton'), characterClose: $('characterCloseButton'), characterKind: $('characterKind'), characterAgent: $('characterAgent'), characterAgentStatus: $('characterAgentStatus'), refreshAgents: $('refreshAgentsButton'), characterConversationLog: $('characterConversationLog'), characterConversationLogStatus: $('characterConversationLogStatus'), characterStt: $('characterStt'), characterTts: $('characterTts'), characterLanguage: $('characterLanguage'), duplicateCharacter: $('duplicateCharacterButton'), saveCharacter: $('saveCharacterButton'),
  imageClosed: document.querySelector('.avatar-closed'), imageOpen: document.querySelector('.avatar-open'), characterImageClosed: $('characterImageClosed'), characterImageOpen: $('characterImageOpen'),
};

const loadClosedImage = createCharacterImageLoader({ image: elements.imageClosed, fallback: bundledAvatarClosed });
const loadOpenImage = createCharacterImageLoader({ image: elements.imageOpen, fallback: bundledAvatarOpen });
const imageStatusText = {
  loading: '画像を確認中…',
  ready: '画像を読み込めました。',
  default: 'デフォルト画像を使用します。',
  fallback: '画像を読み込めないため、デフォルト画像を使用します。パスと選択したAgentを確認してください。',
  error: 'デフォルト画像も読み込めませんでした。画面を再読み込みしてください。',
};
const editorImageChecks = ['Closed', 'Open'].map((kind) => {
  const status = $(`characterImage${kind}Status`);
  const input = elements[`characterImage${kind}`];
  const load = createCharacterImageLoader({
    image: new Image(), fallback: kind === 'Closed' ? bundledAvatarClosed : bundledAvatarOpen,
    onStatus(state) {
      status.textContent = imageStatusText[state];
      status.dataset.state = state;
      input.setAttribute('aria-invalid', String(state === 'fallback' || state === 'error'));
    },
  });
  return () => load(resolveCharacterImage(input.value.trim(), kind.toLowerCase(), elements.characterAgent.value), { retry: true });
});
function checkEditorImages() { editorImageChecks.forEach((check) => check()); }

const params = new URLSearchParams(location.search);
const view = params.get('view') || 'app';
const overlayView = ['overlay', 'character', 'bubble'].includes(view);
let availableAgents = [];
let customCharacters = JSON.parse(localStorage.getItem('xangi-avatar:custom-characters') || '[]').map(normalizeCharacter);
const storedMode = localStorage.getItem('xangi-avatar:character');
const requestedMode = params.get('character') || storedMode;
let mode = customCharacters.find(({ id }) => id === requestedMode)?.id || characterById(requestedMode).id;
let appSessionId = '';
let activeThreadId = appSessionId ? `web:${appSessionId}` : '';
let sessionValidated = !appSessionId;
let activeTurnId = '';
let responseText = '';
let recognition = null;
let recorder = null;
let recorderStream = null;
let serverAudio = null;
let speechQueue = null;
let releasePlayback = null;
let serverAudioUrl = null;
let audioSource = null;
const serverAudioPlayback = new ServerAudioPlayback();
let speaking = false;
let editingCharacter = null;
let activeScreenSessionId = '';
let activeScreenStartedAt = '';
let conversationLogConfigured = false;
let notionTokenConfigured = false;
let notionLoggingEnabled = localStorage.getItem('xangi-avatar:notion-logging') !== 'off';
let overlayPublishTimer = null;
let overlayResponseText = '';
let receivedOverlayState = null;
let bubbleSourceText = '';
let bubblePages = [];
let bubblePageIndex = 0;
let bubblePageTimer = null;
let selectedAudioInputId = localStorage.getItem('xangi-avatar:audio-input') || '';
let activeAudioInputLabel = '';
let microphoneMuted = false;
const visualTurnIds = new Set();
const visualTurnRecords = new Map();
const findCharacter = (id) => {
  const character = customCharacters.find((candidate) => candidate.id === id) || characterById(id);
  const agent = availableAgents.find(({ id }) => id === character.agentId);
  return { ...character, name: agent?.name || character.name || 'Agent未選択', role: agent?.role || '' };
};
const activeCharacter = () => findCharacter(mode);
function scheduleOverlayPublish() {
  if (overlayView) return;
  if (overlayPublishTimer) clearTimeout(overlayPublishTimer);
  overlayPublishTimer = setTimeout(() => {
    overlayPublishTimer = null;
    void publishOverlayState().catch((error) => console.warn('overlay state publish failed', error));
  }, 60);
}

function currentOverlayPayload() {
  if (overlayView && receivedOverlayState) {
    return {
      ...receivedOverlayState,
      text: overlayResponseText,
      character: { ...(receivedOverlayState.character || {}) },
    };
  }
  const character = activeCharacter();
  return {
    state: elements.avatar.dataset.state || 'idle',
    detail: elements.stateBadge.textContent || '',
    text: overlayResponseText,
    character: {
      name: character.name,
      imageClosed: resolveCharacterImage(character.imageClosed, 'closed', character.agentId),
      imageOpen: resolveCharacterImage(character.imageOpen, 'open', character.agentId),
    },
  };
}

async function publishOverlayState() {
  const response = await fetch('/api/avatar/overlay/state', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(currentOverlayPayload()),
  });
  if (!response.ok) throw new Error(`overlay state HTTP ${response.status}`);
}

function applyOverlayState(state) {
  if (!state || !['idle', 'listening', 'thinking', 'speaking', 'error'].includes(state.state)) return;
  receivedOverlayState = state;
  overlayResponseText = state.text || '';
  elements.avatar.dataset.state = state.state;
  elements.stateBadge.textContent = state.detail || state.state;
  elements.bubble.classList.toggle('is-thinking', state.state === 'thinking' && state.detail !== '返答を受信中…');
  showBubble(state.text || '', { final: state.state === 'speaking' || state.state === 'idle' });
  const character = state.character || {};
  if (character.imageClosed) loadClosedImage(character.imageClosed);
  if (character.imageOpen) loadOpenImage(character.imageOpen);
  if (character.name) elements.imageClosed.alt = `${character.name}のアバター`;
}

function bubblePageLimit() {
  if (view === 'bubble') return innerWidth <= 600 ? 150 : 260;
  return innerWidth <= 600 ? 100 : 160;
}

function renderBubblePage() {
  const page = bubblePages[bubblePageIndex] || '';
  elements.bubbleText.textContent = page;
  elements.bubble.hidden = !bubbleSourceText && !elements.bubble.classList.contains('is-thinking');
  const paged = bubblePages.length > 1;
  elements.bubblePage.hidden = !paged;
  elements.bubblePage.textContent = paged ? `${bubblePageIndex + 1} / ${bubblePages.length}` : '';
}

function stopBubblePaging() {
  clearInterval(bubblePageTimer);
  bubblePageTimer = null;
}

function showBubble(text, { final = false } = {}) {
  const nextText = String(text || '');
  const changed = nextText !== bubbleSourceText;
  if (changed) {
    bubbleSourceText = nextText;
    bubblePages = splitBubblePages(nextText, bubblePageLimit());
    bubblePageIndex = final ? 0 : Math.max(0, bubblePages.length - 1);
    stopBubblePaging();
  }
  renderBubblePage();
  if (final && bubblePages.length > 1 && !bubblePageTimer) {
    bubblePageTimer = setInterval(() => {
      bubblePageIndex = (bubblePageIndex + 1) % bubblePages.length;
      renderBubblePage();
    }, 6500);
  }
  scheduleOverlayPublish();
}

function dismissBubble() {
  if (elements.bubble.hidden) return;
  overlayResponseText = '';
  elements.bubble.classList.remove('is-thinking');
  showBubble('');
  if (overlayPublishTimer) {
    clearTimeout(overlayPublishTimer);
    overlayPublishTimer = null;
  }
  void publishOverlayState().catch((error) => console.warn('overlay dismiss publish failed', error));
}

async function refreshAudioInputs() {
  const inputs = await listAudioInputs(navigator.mediaDevices);
  const selectedExists = inputs.some(({ deviceId }) => deviceId === selectedAudioInputId);
  if (selectedAudioInputId && inputs.length && !selectedExists) {
    selectedAudioInputId = '';
    localStorage.removeItem('xangi-avatar:audio-input');
    elements.audioInputStatus.textContent = '選択していたマイクが見つからないため、システムのデフォルトへ戻しました。';
  }
  elements.audioInput.replaceChildren(
    Object.assign(document.createElement('option'), { value: '', textContent: 'システムのデフォルト' }),
    ...inputs.map(({ deviceId, label }) => Object.assign(document.createElement('option'), { value: deviceId, textContent: label })),
  );
  elements.audioInput.value = selectedAudioInputId;
}

async function requestSelectedMicrophone() {
  const { stream, fellBack } = await openAudioInput(navigator.mediaDevices, selectedAudioInputId);
  if (fellBack) {
    selectedAudioInputId = '';
    localStorage.removeItem('xangi-avatar:audio-input');
    elements.audioInputStatus.textContent = '選択したマイクへ接続できないため、システムのデフォルトを使用しています。';
  }
  activeAudioInputLabel = stream.getAudioTracks()[0]?.label || elements.audioInput.selectedOptions[0]?.textContent || 'システムのデフォルト';
  elements.audioInputStatus.textContent = `使用中: ${activeAudioInputLabel}`;
  void refreshAudioInputs().catch(() => {});
  return stream;
}

function connectOverlayState() {
  const source = new EventSource('/api/avatar/overlay/events');
  source.addEventListener('overlay.state', (event) => {
    try { applyOverlayState(JSON.parse(event.data || '{}')); }
    catch (error) { console.warn('invalid overlay state', error); }
  });
}
function publishOverlayIdle() {
  if (overlayView || !navigator.sendBeacon) return;
  const character = activeCharacter();
  navigator.sendBeacon('/api/avatar/overlay/state', new Blob([JSON.stringify({
    state: 'idle',
    detail: '待機中',
    text: overlayResponseText,
    character: {
      name: character.name,
      imageClosed: resolveCharacterImage(character.imageClosed, 'closed', character.agentId),
      imageOpen: resolveCharacterImage(character.imageOpen, 'open', character.agentId),
    },
  })], { type: 'application/json' }));
}
let modelRefreshVersion = 0;
async function refreshModelExecution({ reset = false } = {}) {
  const version = ++modelRefreshVersion;
  const sessionId = appSessionId;
  const label = $('modelExecutionLabel');
  if (reset || !sessionId) label.textContent = formatModelExecution(null);
  if (!sessionId) return;
  try {
    const response = await fetch(`/api/avatar/session/status?sessionId=${encodeURIComponent(sessionId)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const detail = await response.json();
    if (version === modelRefreshVersion && sessionId === appSessionId) label.textContent = formatModelExecution(detail.modelExecution);
  } catch {
    if (version === modelRefreshVersion && sessionId === appSessionId) label.textContent = '実行モデル：取得できませんでした';
  }
}
function useSession(sessionId, { validated = true } = {}) {
  appSessionId = sessionId || '';
  activeThreadId = appSessionId ? `web:${appSessionId}` : '';
  activeTurnId = '';
  sessionValidated = !appSessionId || validated;
  saveCharacterSession(localStorage, `${mode}:${activeCharacter().agentId || ''}`, appSessionId);
  void refreshModelExecution({ reset: true });
}
async function createAvatarSession(sessionKind = 'conversation') {
  await xangiOptionsReady;
  const character = activeCharacter();
  if (!character.agentId) throw new Error('キャラクター設定でプリセットを複製し、本体のAgentを選択してください。');
  const response = await fetch('/api/avatar/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...character, sessionKind }) });
  const session = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(session.error || 'xangi Sessionを作成できませんでした。');
  useSession(session.sessionId);
  return session.sessionId;
}
async function ensureAvatarSession(sessionKind = 'conversation') {
  if (appSessionId && !sessionValidated) {
    const response = await fetch(`/api/avatar/session/status?sessionId=${encodeURIComponent(appSessionId)}`);
    const status = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(status.error || 'xangi Sessionの状態を確認できませんでした。');
    if (!status.exists || status.lifecycle !== 'open') useSession('');
    else sessionValidated = true;
  }
  if (!appSessionId) await createAvatarSession(sessionKind);
  return appSessionId;
}
async function closeAvatarSession(sessionId) {
  if (!sessionId) return;
  const response = await fetch('/api/avatar/session/close', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'xangi Sessionを完了できませんでした。');
}
async function replaceAvatarSession(sessionKind = 'conversation') {
  const previousSessionId = appSessionId;
  useSession('');
  if (previousSessionId) await closeAvatarSession(previousSessionId);
  return createAvatarSession(sessionKind);
}
const handsFree = new HandsFree({
  requestStream: requestSelectedMicrophone,
  onAudio: async (blob, version, audioMetrics) => {
    const framePromise = screenConversation.active ? screenConversation.capture() : Promise.resolve(null);
    setState('thinking', 'Whisperで文字起こし中…');
    const response = await fetch(`/api/avatar/stt?language=${encodeURIComponent(activeCharacter().language)}`, { method: 'POST', headers: { 'content-type': blob.type }, body: blob });
    const result = await response.json();
    const frame = await framePromise;
    if (!handsFree.active || handsFree.version !== version) return;
    if (!response.ok) throw new Error(result.error || '音声認識に失敗しました。');
    const assessment = assessTranscript(result);
    if (!assessment.accepted) {
      elements.handsFreeStatus.textContent = `${assessment.reason} ${activeAudioInputLabel}で聞き直します。`;
      setState('listening', '認識を見送りました。もう一度話してください');
      handsFree.resume();
      return;
    }
    elements.handsFreeStatus.textContent = `認識: 「${assessment.text}」／${activeAudioInputLabel}／発話 ${(audioMetrics?.voiceMs || 0) / 1000}秒`;
    await sendUserMessage(assessment.text, { displayText: `あなた: ${assessment.text}`, frame, version });
  },
  onCalibrating: () => setState('listening', '周囲の音を確認中…少し待ってください'),
  onListening: () => setState('listening', `聞いています（${activeAudioInputLabel}／話し終わると自動送信）`),
  onChange: (active) => {
    $('handsFreeButton').textContent = active ? '会話終了' : '連続会話を開始';
    $('handsFreeButton').setAttribute('aria-pressed', String(active));
    elements.mic.disabled = active;
    updateMicrophoneUi();
  },
  onError: (error) => {
    showError(error.message);
  },
});
const screenConversation = new ScreenConversation({
  onStart: async () => {
    activeScreenStartedAt = new Date().toISOString();
    activeScreenSessionId = await replaceAvatarSession('screen');
  },
  onChange: (active) => {
    elements.screenConversation.textContent = active ? '画面共有を停止' : '画面共有を開始';
    elements.screenConversation.setAttribute('aria-pressed', String(active));
    elements.screenConversationStatus.textContent = active
      ? '共有中。音声またはテキストを送信した時点の画面をAIへ送ります。'
      : 'Macで共有するウィンドウを選ぶと、送信時の画面もAIへ送ります。';
    if (!active && activeScreenSessionId) {
      const completedSessionId = activeScreenSessionId;
      activeScreenSessionId = '';
      activeScreenStartedAt = '';
      if (appSessionId === completedSessionId) useSession('');
      void closeAvatarSession(completedSessionId).catch((error) => showError(error.message));
    }
  },
  onState: (message) => { elements.screenConversationStatus.textContent = message; },
});

function updateMicrophoneUi() {
  elements.microphoneMute.textContent = microphoneMuted ? 'マイクをオン' : 'マイクをミュート';
  elements.microphoneMute.setAttribute('aria-pressed', String(microphoneMuted));
  if (microphoneMuted) {
    elements.handsFreeStatus.textContent = 'マイクはミュート中です。画面共有と会話Sessionは継続します。';
  } else if (handsFree.active) {
    elements.handsFreeStatus.textContent = `${elements.audioInput.selectedOptions[0]?.textContent || '選択したマイク'}で聞いています。返答中は自動で休止します。`;
  } else {
    elements.handsFreeStatus.textContent = '連続会話はWhisperで自動送信。返答中は聞き取りを休止します。';
  }
}

function cancelManualInput() {
  if (recognition) {
    const currentRecognition = recognition;
    recognition = null;
    currentRecognition.onend = null;
    currentRecognition.abort?.();
  }
  if (recorder) {
    const currentRecorder = recorder;
    recorder = null;
    currentRecorder.onstop = null;
    if (currentRecorder.state === 'recording') currentRecorder.stop();
  }
  recorderStream?.getTracks().forEach((track) => track.stop());
  recorderStream = null;
}

function setMicrophoneMuted(muted) {
  microphoneMuted = Boolean(muted);
  handsFree.setMuted(microphoneMuted);
  if (microphoneMuted) {
    cancelManualInput();
    if (elements.avatar.dataset.state === 'listening') setState('idle', 'マイクはミュート中');
  } else if (handsFree.active) {
    setState('listening', 'マイクを再開中…');
  }
  updateMicrophoneUi();
}

function refreshCharacters() {
  elements.mode.replaceChildren(...[...CHARACTER_PRESETS, ...customCharacters].map((character) => Object.assign(document.createElement('option'), { value: character.id, textContent: `${findCharacter(character.id).name}${findCharacter(character.id).role ? `｜${findCharacter(character.id).role}` : ''}` })));
  elements.mode.value = mode;
}
function loadVoiceProviders() {
  elements.characterStt.replaceChildren(...VOICE_PROVIDERS.stt.map((provider) => Object.assign(document.createElement('option'), { value: provider.id, textContent: provider.label })));
  elements.characterTts.replaceChildren(...VOICE_PROVIDERS.tts.map((provider) => Object.assign(document.createElement('option'), { value: provider.id, textContent: provider.label })));
}
function resolveCharacterImage(value, fallback, agentId = '') {
  value = String(value || '').trim();
  if (!value || value === './assets/avatar-closed.png') return fallback === 'closed' ? bundledAvatarClosed : bundledAvatarOpen;
  if (value === './assets/avatar-open.png') return bundledAvatarOpen;
  if (Object.hasOwn(presetImages, value)) return presetImages[value];
  if (/^(?:https?:|data:|blob:)/iu.test(value) || value.startsWith('/')) return value;
  return `/api/avatar/workspace-image?${new URLSearchParams({ agentId, path: value })}`;
}
function applyCharacterView() {
  void refreshModelExecution({ reset: true });
  const character = activeCharacter();
  loadClosedImage(resolveCharacterImage(character.imageClosed, 'closed', character.agentId), { retry: true });
  loadOpenImage(resolveCharacterImage(character.imageOpen, 'open', character.agentId), { retry: true });
  elements.imageClosed.alt = `${character.name}のアバター`;
  scheduleOverlayPublish();
}
function openCharacterEditor(character = activeCharacter(), editable = !CHARACTER_PRESETS.some(({ id }) => id === character.id)) {
  editingCharacter = editable ? character : null; elements.characterKind.textContent = editable ? 'カスタムキャラクター' : 'プリセット（複製して編集できます）';
  const fields = [[elements.characterAgent,'agentId'],[elements.characterStt,'stt'],[elements.characterTts,'tts'],[elements.characterLanguage,'language'],[elements.characterImageClosed,'imageClosed'],[elements.characterImageOpen,'imageOpen']];
  for (const [element,key] of fields) { element.value = character[key] || ''; element.disabled = !editable; }
  elements.characterConversationLog.checked = character.conversationLog === true;
  elements.characterConversationLog.disabled = !editable || !conversationLogConfigured;
  elements.characterConversationLogStatus.textContent = conversationLogConfigured
    ? '有効にすると、画面付き会話の各ターンを画像・発話・返答とともにNotionへ記録します。'
    : 'Notion未設定です。サーバーへNOTION_API_KEYとNOTION_CONVERSATION_PARENT_PAGE_IDを設定してください。';
  elements.saveCharacter.hidden = !editable; elements.duplicateCharacter.hidden = false; elements.characterDialog.showModal();
  renderAgentOptions(character.agentId, !editable);
  checkEditorImages();
  void refreshAgentOptions().catch((error) => { elements.characterAgentStatus.textContent = error.message; });
}

function setState(state, detail = '') {
  const labels = { idle: '待機中', listening: '聞いています…', thinking: '考え中…', speaking: '話しています', error: 'エラー' };
  elements.avatar.dataset.state = state;
  elements.bubble.classList.toggle('is-thinking', state === 'thinking' && !responseText);
  elements.stateBadge.textContent = detail || labels[state] || state;
  elements.mic.setAttribute('aria-pressed', state === 'listening' ? 'true' : 'false');
  elements.micLabel.textContent = state === 'listening' ? '聞き取りを止める' : '話しかける';
  renderBubblePage();
  scheduleOverlayPublish();
}

function showError(message) {
  elements.error.textContent = message;
  elements.error.hidden = !message;
  if (message) { handsFree.stop(); setState('error'); }
}

function speechErrorMessage(code) {
  const messages = {
    'not-allowed': 'マイクが許可されていません。ブラウザのサイト設定でマイクを許可してください。',
    'service-not-allowed': '音声認識を利用できません。SafariではSiriまたは音声入力を有効にしてください。',
    'audio-capture': '利用できるマイクが見つかりません。',
    network: '音声認識サービスへ接続できませんでした。',
    'no-speech': '音声を認識できませんでした。もう一度試してください。',
  };
  return messages[code] || `音声認識エラー: ${code}`;
}

function stopSpeaking() {
  speechQueue?.cancel();
  speechQueue = null;
  releasePlayback?.();
  releasePlayback = null;
  if (serverAudioUrl) { URL.revokeObjectURL(serverAudioUrl); serverAudioUrl = null; }
  if (audioSource) { audioSource.onended = null; audioSource.stop(); audioSource.disconnect(); audioSource = null; }
  serverAudioPlayback.stop();
  window.speechSynthesis?.cancel?.();
  if (serverAudio) { serverAudio.pause(); serverAudio.src = ''; serverAudio = null; }
  speaking = false;
  setState('idle');
}

function preferredVoice(language) {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  const exact = voices.find((voice) => voice.lang.toLowerCase() === language.toLowerCase());
  if (exact) return exact;
  const baseLanguage = language.toLowerCase().split('-')[0];
  return voices.find((voice) => voice.lang.toLowerCase().startsWith(`${baseLanguage}-`));
}

async function prepareSpeech(text, provider, language, signal) {
  if (provider === 'browser') return null;
  const response = await fetch('/api/avatar/tts', { method: 'POST', signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, provider, language }) });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || `音声合成 HTTP ${response.status}`); }
  return response.blob();
}

function playSpeech(blob, text, provider, language, signal, isTest) {
  return new Promise((resolve, reject) => {
    const finish = () => {
      if (releasePlayback === finish) releasePlayback = null;
      if (!signal.aborted) { speaking = false; setState('thinking', '返答を読み上げ中…'); }
      resolve();
    };
    releasePlayback = finish;
    const start = () => {
      if (signal.aborted) return;
      speaking = true;
      setState('speaking');
      if (isTest) elements.voiceLabel.textContent = '再生中…';
    };
    const run = async () => {
      if (signal.aborted) return finish();
      if (provider === 'browser') {
        if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
          setState('idle');
          throw new Error('このブラウザは音声読み上げに対応していません。');
        }
        window.speechSynthesis.resume();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = language;
        utterance.voice = preferredVoice(language) || null;
        utterance.onstart = start;
        utterance.onend = finish;
        utterance.onerror = (event) => signal.aborted ? finish() : reject(new Error(event.error || '音声を再生できませんでした。'));
        window.speechSynthesis.speak(utterance);
      } else if (handsFree.active && handsFree.context) {
        const context = handsFree.context;
        const buffer = await context.decodeAudioData(await blob.arrayBuffer());
        if (signal.aborted) return finish();
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        audioSource = source;
        source.onended = () => { source.disconnect(); audioSource = null; finish(); };
        source.start();
        start();
      } else if (serverAudioPlayback.context) {
        const started = await serverAudioPlayback.play(blob, { canStart: () => !signal.aborted, onStart: start, onEnd: finish });
        if (!started) finish();
      } else {
        const url = URL.createObjectURL(blob);
        serverAudioUrl = url;
        const audio = new Audio(url);
        serverAudio = audio;
        const cleanup = () => {
          URL.revokeObjectURL(url);
          if (serverAudio === audio) { serverAudio = null; serverAudioUrl = null; }
        };
        audio.onplay = start;
        audio.onended = () => { cleanup(); finish(); };
        audio.onerror = () => { cleanup(); reject(new Error('音声を再生できませんでした。')); };
        await audio.play();
      }
    };
    run().catch(reject);
  });
}

function beginSpeech({ isTest = false } = {}) {
  stopSpeaking();
  handsFree.pause();
  const { tts: provider, language } = activeCharacter();
  speechQueue = new StreamingSpeech({
    prepare: (text, signal) => prepareSpeech(text, provider, language, signal),
    play: (blob, text, signal) => playSpeech(blob, text, provider, language, signal, isTest),
    onDone: () => {
      speaking = false;
      setState('idle');
      handsFree.resume();
      if (isTest) elements.voiceLabel.textContent = '声を試す';
    },
    onError: (error) => {
      stopSpeaking();
      if (isTest) elements.voiceLabel.textContent = '声を試す';
      showError(`読み上げエラー: ${error.message}`);
    },
  });
}

function speak(text, { isTest = false } = {}) {
  showError('');
  beginSpeech({ isTest });
  speechQueue.update(text, true);
}

function testVoice() {
  void serverAudioPlayback.unlock();
  speak(activeCharacter().language.startsWith('en') ? 'Voice output is ready.' : '音声を有効にしました。', { isTest: true });
}

async function sendMessage(rawText, { displayText = '', turnKind = 'message', screenContext = null } = {}) {
  const text = String(rawText || '').trim();
  if (!text) return;
  handsFree.pause();
  showError('');
  stopSpeaking();
  responseText = '';
  overlayResponseText = '';
  setState('thinking');
  showBubble(displayText || `あなた: ${text}`);
  await ensureAvatarSession(turnKind === 'screen' ? 'screen' : 'conversation');
  activeTurnId = '';
  beginSpeech();
  setState('thinking');
  const response = await fetch('/api/avatar/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: buildCharacterPrompt(activeCharacter(), text),
      appSessionId: appSessionId || undefined,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `xangi HTTP ${response.status}`);
  appSessionId = body.session_id || appSessionId;
  activeThreadId = body.thread_id || activeThreadId;
  activeTurnId = body.turn_id || '';
  if (turnKind === 'screen' && activeTurnId) {
    visualTurnIds.add(activeTurnId);
    visualTurnRecords.set(activeTurnId, {
      ...screenContext,
      sessionId: appSessionId,
      startedAt: activeScreenStartedAt,
      characterName: activeCharacter().name,
      enabled: activeCharacter().conversationLog === true,
    });
  }
  if (appSessionId) saveCharacterSession(localStorage, `${mode}:${activeCharacter().agentId || ''}`, appSessionId);
}

async function sendUserMessage(rawText, { displayText = '', frame = null, version = null } = {}) {
  const text = String(rawText || '').trim();
  if (!text) return;
  if (!screenConversation.active) {
    await sendMessage(text, { displayText });
    return;
  }
  const capturedFrame = frame || await screenConversation.capture();
  if (!screenConversation.active) {
    await sendMessage(text, { displayText });
    return;
  }
  if (version !== null && (!handsFree.active || handsFree.version !== version)) return;
  setState('thinking', '発話と画面を送信中…');
  const uploadResponse = await fetch('/api/avatar/frame', { method: 'POST', headers: { 'content-type': capturedFrame.type }, body: capturedFrame });
  const upload = await uploadResponse.json().catch(() => ({}));
  if (version !== null && (!handsFree.active || handsFree.version !== version)) return;
  if (!uploadResponse.ok) throw new Error(upload.error || '画面を送信できませんでした。');
  await sendMessage(buildScreenConversationPrompt(text, upload.imagePath), {
    displayText: displayText || `あなた: ${text}`,
    turnKind: 'screen',
    screenContext: { imagePath: upload.imagePath, spokenText: text },
  });
}

async function saveConversationTurn(turn, response) {
  if (!turn?.enabled || !notionLoggingEnabled || !conversationLogConfigured || !turn.imagePath) return;
  const result = await fetch('/api/avatar/conversation-log', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sessionId: turn.sessionId,
      startedAt: turn.startedAt,
      recordedAt: new Date().toISOString(),
      characterName: turn.characterName,
      imagePath: turn.imagePath,
      spokenText: turn.spokenText,
      responseText: String(response || '').replace(/<xangi_reply_suggestions>[\s\S]*$/u, '').trim(),
    }),
  });
  const body = await result.json().catch(() => ({}));
  if (!result.ok) throw new Error(body.error || `Notion HTTP ${result.status}`);
  elements.screenConversationStatus.textContent = '画像付き会話をNotionへ記録しました。';
}

function handleEvent(event) {
  if (!event || !activeThreadId || event.thread_id !== activeThreadId) return;
  if (activeTurnId && event.turn_id && event.turn_id !== activeTurnId) return;
  if (event.type === 'turn.started') {
    activeThreadId = event.thread_id || activeThreadId;
    activeTurnId = event.turn_id || activeTurnId;
    responseText = '';
    beginSpeech();
    setState('thinking');
  } else if (event.type === 'message.delta') {
    responseText = event.full_text || `${responseText}${event.text || ''}`;
    overlayResponseText = responseText;
    showBubble(responseText);
    speechQueue?.update(responseText);
    if (!speaking) setState('thinking', '返答を受信中…');
  } else if (event.type === 'turn.complete') {
    void refreshModelExecution();
    const visualTurn = visualTurnRecords.get(event.turn_id);
    visualTurnIds.delete(event.turn_id);
    visualTurnRecords.delete(event.turn_id);
    responseText = event.text || responseText;
    overlayResponseText = responseText;
    showBubble(responseText, { final: true });
    speechQueue?.update(responseText, true);
    void saveConversationTurn(visualTurn, responseText).catch((error) => {
      console.warn('conversation log save failed', error);
      elements.screenConversationStatus.textContent = `画面付き会話は継続中・Notionへの記録に失敗: ${error.message}`;
    });
  } else if (event.type === 'turn.aborted') {
    stopSpeaking();
    void refreshModelExecution();
    visualTurnIds.delete(event.turn_id);
    visualTurnRecords.delete(event.turn_id);
    setState('idle');
    handsFree.resume();
  } else if (event.type === 'agent.error') {
    stopSpeaking();
    void refreshModelExecution();
    if (event.turn_id) {
      visualTurnIds.delete(event.turn_id);
      visualTurnRecords.delete(event.turn_id);
    }
    screenConversation.stop();
    showError(event.message || 'xangiでエラーが発生しました。');
  }
}

function connectEvents() {
  const source = new EventSource('/api/avatar/events');
  source.addEventListener('ready', (event) => {
    const info = JSON.parse(event.data || '{}');
    elements.connection.textContent = `${info.instance_id || 'xangi'} 接続済み`;
  });
  source.onmessage = (event) => {
    try { handleEvent(JSON.parse(event.data)); } catch (error) { console.warn('invalid xangi event', error); }
  };
  source.onerror = () => { elements.connection.textContent = 'xangiへ再接続中…'; };
}

function startRecognition() {
  if (microphoneMuted) { updateMicrophoneUi(); setState('idle', 'マイクはミュート中'); return; }
  if (handsFree.active) return;
  if (activeCharacter().stt === 'whisper') { startServerRecognition(); return; }
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    showError('音声入力にはHTTPSが必要です。HTTPSのURLで開いてください。');
    return;
  }
  if (!Recognition) {
    showError('このブラウザは音声認識に対応していません。SafariまたはChromeで開いてください。');
    return;
  }
  if (recognition) { recognition.stop(); return; }
  stopSpeaking();
  showError('');
  recognition = new Recognition();
  recognition.lang = activeCharacter().language;
  recognition.continuous = false;
  recognition.interimResults = true;
  let transcript = '';
  recognition.onstart = () => setState('listening');
  recognition.onresult = (event) => {
    transcript = Array.from(event.results).map((result) => result[0]?.transcript || '').join('');
    showBubble(`あなた: ${transcript}`);
  };
  recognition.onerror = (event) => showError(speechErrorMessage(event.error));
  recognition.onend = () => {
    recognition = null;
    if (transcript.trim()) sendUserMessage(transcript).catch((error) => showError(error.message));
    else if (!elements.error.textContent) setState('idle');
  };
  try { recognition.start(); } catch (error) { recognition = null; showError(error.message); }
}

async function startServerRecognition() {
  if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    showError('音声入力にはHTTPSが必要です。HTTPSのURLで開いてください。'); return;
  }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    showError('このブラウザは録音に対応していません。ブラウザ音声認識へ切り替えてください。'); return;
  }
  if (recorder) { recorder.stop(); return; }
  try {
    stopSpeaking(); showError('');
    recorderStream = await requestSelectedMicrophone();
    const chunks = [];
    recorder = new MediaRecorder(recorderStream);
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = (event) => showError(`録音エラー: ${event.error?.message || '録音できませんでした'}`);
    recorder.onstop = async () => {
      const current = recorder; recorder = null;
      recorderStream?.getTracks().forEach((track) => track.stop()); recorderStream = null;
      if (!chunks.length) { setState('idle'); return; }
      try {
        setState('thinking', 'Whisperで文字起こし中…');
        const blob = new Blob(chunks, { type: current.mimeType || 'audio/webm' });
        const response = await fetch(`/api/avatar/stt?language=${encodeURIComponent(activeCharacter().language)}`, { method: 'POST', headers: { 'content-type': blob.type }, body: blob });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || `音声認識 HTTP ${response.status}`);
        const assessment = assessTranscript(result);
        if (!assessment.accepted) { showError(assessment.reason); setState('idle'); return; }
        elements.audioInputStatus.textContent = `認識: 「${assessment.text}」／${activeAudioInputLabel}`;
        showBubble(`あなた: ${assessment.text}`);
        await sendUserMessage(assessment.text, { displayText: `あなた: ${assessment.text}` });
      } catch (error) { showError(`音声認識エラー: ${error.message}`); }
    };
    recorder.start(); setState('listening', '録音中（もう一度押して送信）');
  } catch (error) {
    recorder = null; recorderStream?.getTracks().forEach((track) => track.stop()); recorderStream = null;
    showError(error.name === 'NotAllowedError' ? 'マイクが許可されていません。ブラウザのサイト設定で許可してください。' : `マイクエラー: ${error.message}`);
  }
}

function applyViewSettings() {
  const requestedBackground = params.get('background') || localStorage.getItem('xangi-avatar:background') || 'studio';
  const background = ['studio', 'transparent', 'green'].includes(requestedBackground) ? requestedBackground : 'studio';
  const controlsVisible = !overlayView && (params.get('controls') === '1' || (params.get('controls') !== '0' && localStorage.getItem('xangi-avatar:controls') !== 'hidden'));
  document.body.dataset.background = background;
  document.body.dataset.view = overlayView ? view : 'app';
  document.documentElement.dataset.view = overlayView ? view : 'app';
  document.body.dataset.controls = controlsVisible ? 'visible' : 'hidden';
  elements.background.value = background;
  elements.controls.checked = controlsVisible;
}

async function loadXangiOptions() {
  const response = await fetch('/api/avatar/config');
  const config = await response.json();
  if (!response.ok) throw new Error(config.error || '設定取得に失敗しました。');
  if (config.voice?.error) console.warn('server voice unavailable', config.voice.error);
  conversationLogConfigured = config.conversationLog?.configured === true;
  notionTokenConfigured = config.conversationLog?.tokenConfigured === true;
  elements.notionLogging.checked = notionLoggingEnabled;
  elements.notionParentPage.value = config.conversationLog?.parentPageUrl || config.conversationLog?.parentPageId || '';
  elements.notionParentPage.disabled = !notionTokenConfigured;
  elements.saveNotionSettings.disabled = !notionTokenConfigured;
  elements.notionSettingsStatus.textContent = notionTokenConfigured
    ? (conversationLogConfigured ? 'このページ配下へ新しい会話記録を保存します。' : '保存先ページを入力してください。')
    : 'Notion APIキーがサーバーに設定されていません。APIキーはWebUIには表示しません。';
  availableAgents = config.agents || [];
  renderAgentOptions();
  const saved = config.characterSettings || {};
  const serverCharacters = Array.isArray(saved.customCharacters) ? saved.customCharacters.map(normalizeCharacter) : [];
  if (serverCharacters.length) {
    customCharacters = serverCharacters;
    localStorage.setItem('xangi-avatar:custom-characters', JSON.stringify(customCharacters));
    const serverMode = [...CHARACTER_PRESETS, ...customCharacters].find(({ id }) => id === saved.selectedCharacter)?.id;
    if (serverMode) {
      mode = serverMode;
      localStorage.setItem('xangi-avatar:character', mode);
    }
    appSessionId = loadCharacterSession(localStorage, `${mode}:${activeCharacter().agentId || ''}`);
    activeThreadId = appSessionId ? `web:${appSessionId}` : '';
    sessionValidated = !appSessionId;
    refreshCharacters();
    applyCharacterView();
  } else if (customCharacters.length) {
    await saveCharacterSettings(customCharacters, mode);
  }
}
async function saveCharacterSettings(characters = customCharacters, selectedCharacter = mode) {
  const response = await fetch('/api/avatar/settings/characters', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ customCharacters: characters, selectedCharacter }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `キャラクター設定 HTTP ${response.status}`);
  return result.characterSettings;
}
function renderAgentOptions(selected = '', disabled = false) {
  elements.characterAgent.replaceChildren(Object.assign(document.createElement('option'), { value: '', textContent: 'Agentを選択してください' }), ...availableAgents.map((agent) => Object.assign(document.createElement('option'), { value: agent.id, textContent: `${agent.name}${agent.role ? `｜${agent.role}` : ''}` })));
  if (selected && !availableAgents.some(({ id }) => id === selected)) elements.characterAgent.append(Object.assign(document.createElement('option'), { value: selected, textContent: '選択したAgentは削除されています', disabled: true }));
  elements.characterAgent.value = selected;
  elements.characterAgent.disabled = disabled;
  elements.characterAgentStatus.textContent = availableAgents.length ? '本体でAgentを変更した場合は一覧を更新してください。' : '本体でAgentを作成してから、一覧を更新してください。';
  if (selected && !availableAgents.some(({ id }) => id === selected)) elements.characterAgentStatus.textContent = '選択したAgentが見つかりません。選び直してください。';
}
async function refreshAgentOptions() {
  const editor = editingCharacter;
  const response = await fetch('/api/avatar/agents');
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Agent一覧を取得できませんでした。');
  availableAgents = result.agents || [];
  if (editor === editingCharacter && elements.characterDialog.open) renderAgentOptions(elements.characterAgent.value, elements.characterAgent.disabled);
  refreshCharacters();
  applyCharacterView();
}

elements.form.addEventListener('submit', (event) => {
  event.preventDefault();
  void serverAudioPlayback.unlock();
  const text = elements.input.value;
  elements.input.value = '';
  sendUserMessage(text).catch((error) => showError(error.message));
});
elements.bubble.addEventListener('click', dismissBubble);
elements.mic.addEventListener('click', () => { void serverAudioPlayback.unlock(); startRecognition(); });
elements.voice.addEventListener('click', testVoice);
elements.newConversation.addEventListener('click', async () => {
  handsFree.stop(); screenConversation.stop(); stopSpeaking(); showError('');
  elements.newConversation.disabled = true;
  elements.newConversation.setAttribute('aria-busy', 'true');
  elements.newConversation.dataset.state = 'loading';
  elements.newConversation.textContent = '作成中…';
  try {
    await replaceAvatarSession('conversation');
    elements.newConversation.dataset.state = 'success';
    showBubble(`${activeCharacter().name}との新しい会話を始めました。`);
  } catch (error) {
    elements.newConversation.dataset.state = 'error';
    showError(error.message);
  } finally {
    elements.newConversation.disabled = false;
    elements.newConversation.removeAttribute('aria-busy');
    elements.newConversation.textContent = '新しい会話';
  }
});
elements.screenConversation.addEventListener('click', () => {
  void serverAudioPlayback.unlock();
  if (screenConversation.active) { screenConversation.stop(); return; }
  if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    showError('画面付き会話にはHTTPSが必要です。MacのChromeでHTTPSのURLを開いてください。');
    return;
  }
  if (recorder || recognition) { showError('手動の聞き取りを止めてから画面付き会話を開始してください。'); return; }
  if (elements.avatar.dataset.state === 'thinking') { showError('返答が終わってから画面付き会話を開始してください。'); return; }
  const resumeHandsFree = handsFree.active && !microphoneMuted;
  if (handsFree.active) handsFree.pause();
  showError(''); stopSpeaking();
  void screenConversation.start().then(() => {
    if (resumeHandsFree) handsFree.resume();
  }).catch((error) => {
    screenConversation.stop();
    if (resumeHandsFree) handsFree.resume();
    if (error.name !== 'NotAllowedError') elements.screenConversationStatus.textContent = `画面共有エラー: ${error.message}`;
  });
});
$('handsFreeButton').addEventListener('click', () => {
  void serverAudioPlayback.unlock();
  if (handsFree.active) { handsFree.stop(); stopSpeaking(); return; }
  if (microphoneMuted) { updateMicrophoneUi(); setState('idle', 'マイクをオンにしてから開始してください'); return; }
  if (recorder || recognition) { showError('手動の聞き取りを止めてから連続会話を開始してください。'); return; }
  if (elements.avatar.dataset.state === 'thinking') { showError('返答が終わってから会話を開始してください。'); return; }
  showError(''); stopSpeaking();
  void handsFree.start();
});
elements.microphoneMute.addEventListener('click', () => {
  showError('');
  setMicrophoneMuted(!microphoneMuted);
});
window.addEventListener('pagehide', () => { handsFree.stop(); screenConversation.stop(); publishOverlayIdle(); });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  if (handsFree.active) { handsFree.stop(); stopSpeaking(); }
});
refreshCharacters();
loadVoiceProviders();
elements.mode.addEventListener('change', () => {
  handsFree.stop(); screenConversation.stop(); stopSpeaking();
  mode = findCharacter(elements.mode.value).id;
  localStorage.setItem('xangi-avatar:character', mode);
  appSessionId = loadCharacterSession(localStorage, `${mode}:${activeCharacter().agentId || ''}`);
  activeThreadId = appSessionId ? `web:${appSessionId}` : '';
  sessionValidated = !appSessionId;
  activeTurnId = '';
  visualTurnIds.clear();
  visualTurnRecords.clear();
  showBubble(`${activeCharacter().name}に切り替えました。`);
  applyCharacterView();
  void saveCharacterSettings().catch((error) => showError(`キャラクター設定を保存できません: ${error.message}`));
});
elements.settingsButton.addEventListener('click', () => {
  elements.settings.showModal();
  void refreshAudioInputs().catch((error) => { elements.audioInputStatus.textContent = `マイク一覧を取得できません: ${error.message}`; });
});
elements.audioInput.addEventListener('change', () => {
  selectedAudioInputId = elements.audioInput.value;
  if (selectedAudioInputId) localStorage.setItem('xangi-avatar:audio-input', selectedAudioInputId);
  else localStorage.removeItem('xangi-avatar:audio-input');
  handsFree.stop();
  if (screenConversation.active) screenConversation.stop();
  stopSpeaking();
  elements.audioInputStatus.textContent = `${elements.audioInput.selectedOptions[0]?.textContent || 'システムのデフォルト'}を保存しました。会話を開始し直してください。`;
});
elements.saveNotionSettings.addEventListener('click', async () => {
  elements.saveNotionSettings.disabled = true;
  elements.saveNotionSettings.dataset.state = 'loading';
  elements.saveNotionSettings.textContent = '確認中…';
  elements.notionSettingsStatus.textContent = 'Notionへの接続とページを確認しています。';
  try {
    const response = await fetch('/api/avatar/settings/notion', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ parentPage: elements.notionParentPage.value }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Notion設定 HTTP ${response.status}`);
    const settings = result.conversationLog || {};
    conversationLogConfigured = settings.configured === true;
    elements.notionParentPage.value = settings.parentPageUrl || settings.parentPageId || '';
    elements.saveNotionSettings.dataset.state = 'success';
    elements.notionSettingsStatus.textContent = `${settings.parentPageTitle ? `「${settings.parentPageTitle}」を` : ''}保存先に設定しました。次の記録から反映されます。`;
  } catch (error) {
    elements.saveNotionSettings.dataset.state = 'error';
    elements.notionSettingsStatus.textContent = `保存できませんでした: ${error.message}`;
  } finally {
    elements.saveNotionSettings.disabled = !notionTokenConfigured;
    elements.saveNotionSettings.textContent = '保存先を確認して保存';
  }
});
elements.notionLogging.addEventListener('change', () => {
  notionLoggingEnabled = elements.notionLogging.checked;
  localStorage.setItem('xangi-avatar:notion-logging', notionLoggingEnabled ? 'on' : 'off');
  elements.notionSettingsStatus.textContent = notionLoggingEnabled
    ? 'Notionへの保存を有効にしました。キャラクターごとの記録設定も適用されます。'
    : 'Notionへの保存を停止しました。設定と既存ログは保持されます。';
});
elements.characterSettings.addEventListener('click', async () => {
  try { await xangiOptionsReady; elements.settings.close(); openCharacterEditor(); }
  catch (error) { showError(error.message); }
});
elements.refreshAgents.addEventListener('click', () => { void refreshAgentOptions().catch((error) => { elements.characterAgentStatus.textContent = error.message; }); });
elements.characterImageClosed.addEventListener('input', editorImageChecks[0]);
elements.characterImageOpen.addEventListener('input', editorImageChecks[1]);
elements.characterAgent.addEventListener('change', checkEditorImages);
$('retryCharacterImages').addEventListener('click', () => {
  checkEditorImages();
  const character = activeCharacter();
  loadClosedImage(resolveCharacterImage(character.imageClosed, 'closed', character.agentId), { retry: true });
  loadOpenImage(resolveCharacterImage(character.imageOpen, 'open', character.agentId), { retry: true });
});
elements.characterClose.addEventListener('click', () => elements.characterDialog.close());
elements.duplicateCharacter.addEventListener('click', () => {
  const source = editingCharacter || activeCharacter();
  openCharacterEditor({ ...source, id: `custom-${Date.now()}`, agentId: source.agentId || '' }, true);
});
elements.characterForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const previousMode = mode;
  const previousSessionId = appSessionId;
  const character = { id: editingCharacter?.id || `custom-${Date.now()}`, agentId: elements.characterAgent.value, conversationLog: elements.characterConversationLog.checked, stt: elements.characterStt.value, tts: elements.characterTts.value, language: elements.characterLanguage.value, imageClosed: elements.characterImageClosed.value || './assets/avatar-closed.png', imageOpen: elements.characterImageOpen.value || './assets/avatar-open.png' };
  if (!availableAgents.some(({ id }) => id === character.agentId)) { elements.characterAgentStatus.textContent = '使うAgentを選択してください。'; return; }
  const nextCharacters = [...customCharacters.filter(({ id }) => id !== character.id), character];
  try {
    await saveCharacterSettings(nextCharacters, character.id);
  } catch (error) {
    showError(`キャラクター設定を保存できません: ${error.message}`);
    return;
  }
  customCharacters = nextCharacters;
  localStorage.setItem('xangi-avatar:custom-characters', JSON.stringify(customCharacters));
  mode = character.id;
  localStorage.setItem('xangi-avatar:character', mode);
  if (character.id === previousMode) {
    clearCharacterConversation(localStorage, `${mode}:${activeCharacter().agentId || ''}`);
    useSession('');
    if (previousSessionId) void closeAvatarSession(previousSessionId).catch((error) => showError(error.message));
  } else {
    appSessionId = loadCharacterSession(localStorage, `${mode}:${activeCharacter().agentId || ''}`);
    activeThreadId = appSessionId ? `web:${appSessionId}` : '';
    activeTurnId = '';
    sessionValidated = !appSessionId;
  }
  refreshCharacters();
  applyCharacterView();
  elements.characterDialog.close();
  showBubble(`${activeCharacter().name}のAvatar設定を保存しました。次の発話から新しい会話になります。`);
});
elements.restoreControls.addEventListener('click', () => {
  document.body.dataset.controls = 'visible';
  elements.controls.checked = true;
  localStorage.setItem('xangi-avatar:controls', 'visible');
});
elements.background.addEventListener('change', () => {
  document.body.dataset.background = elements.background.value;
  localStorage.setItem('xangi-avatar:background', elements.background.value);
});
elements.controls.addEventListener('change', () => {
  document.body.dataset.controls = elements.controls.checked ? 'visible' : 'hidden';
  localStorage.setItem('xangi-avatar:controls', elements.controls.checked ? 'visible' : 'hidden');
});
window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'v' && !['INPUT', 'SELECT'].includes(document.activeElement?.tagName)) startRecognition();
  if (event.key === 'Escape') { handsFree.stop(); screenConversation.stop(); stopSpeaking(); }
});

applyViewSettings();
applyCharacterView();
void refreshAudioInputs().catch(() => {});
navigator.mediaDevices?.addEventListener?.('devicechange', () => { void refreshAudioInputs().catch(() => {}); });
const xangiOptionsReady = loadXangiOptions();
xangiOptionsReady.catch((error) => showError(`xangi設定取得エラー: ${error.message}`));
setState('idle');
connectEvents();
if (overlayView) connectOverlayState();
