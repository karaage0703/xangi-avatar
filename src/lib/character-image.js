// Resolve relative images against the selected agent, never a bundled path alias.
export function resolveWorkspaceImage(value, state, agentId, bundled) {
  value = String(value || '').trim() || `./assets/xangi-avatar/${state}.png`;
  if (value === './assets/avatar-closed.png') return bundled.closed;
  if (value === './assets/avatar-open.png') return bundled.open;
  if (/^(?:https?:|data:|blob:)/iu.test(value) || value.startsWith('/')) return value;
  return `api/avatar/workspace-image?${new URLSearchParams({ agentId, path: value })}`;
}

// Preload before replacing the visible image, and ignore obsolete requests.
export function createCharacterImageLoader({ image, fallback, allowFallback = true, onStatus = () => {}, createImage = () => new Image() }) {
  let revision = 0;
  let currentSource;
  return function load(source, { retry = false } = {}) {
    if (source === currentSource && !retry) return;
    currentSource = source;
    const request = ++revision;
    onStatus('loading');
    const probe = (url, usingFallback) => {
      const candidate = createImage();
      candidate.onload = () => {
        if (request !== revision) return;
        image.src = url;
        onStatus(usingFallback ? 'fallback' : url === fallback ? 'default' : 'ready');
      };
      candidate.onerror = () => {
        if (request !== revision) return;
        if (allowFallback && url !== fallback) probe(fallback, true);
        else onStatus('error'); // Never retry a broken bundled image in a loop.
      };
      candidate.src = url;
    };
    probe(source || fallback, false);
  };
}
