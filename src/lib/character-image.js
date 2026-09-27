// Preload before replacing the visible image, and ignore obsolete requests.
export function createCharacterImageLoader({ image, fallback, onStatus = () => {}, createImage = () => new Image() }) {
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
        if (url !== fallback) probe(fallback, true);
        else onStatus('error'); // Never retry a broken bundled image in a loop.
      };
      candidate.src = url;
    };
    probe(source || fallback, false);
  };
}
