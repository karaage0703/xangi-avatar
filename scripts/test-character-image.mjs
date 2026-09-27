import assert from 'node:assert/strict';
import { createCharacterImageLoader } from '../src/lib/character-image.js';

function fixture() {
  const requests = [], statuses = [], image = { src: 'previous.png' };
  const load = createCharacterImageLoader({ image, fallback: 'default.png',
    createImage() { const request = {}; requests.push(request); return request; },
    onStatus(state) { statuses.push(state); },
  });
  return { requests, statuses, image, load };
}
// A failed custom image preserves the current display until the default loads.
const f = fixture();
f.load('missing.png');
f.requests[0].onerror();
assert.equal(f.image.src, 'previous.png');
assert.equal(f.requests[1].src, 'default.png');
f.requests[1].onload();
assert.equal(f.image.src, 'default.png');
assert.equal(f.statuses.at(-1), 'fallback');
// Repeated overlay updates do not repeatedly fetch a missing file.
f.load('missing.png');
assert.equal(f.requests.length, 2);
// Explicit retry can recover without changing the configured path.
f.load('missing.png', { retry: true });
f.requests[2].onload();
assert.equal(f.image.src, 'missing.png');
assert.equal(f.statuses.at(-1), 'ready');
// Old successes and errors cannot overwrite a more recently selected image.
f.load('slow.png');
const old = f.requests.at(-1);
f.load('new.png');
f.requests.at(-1).onload();
old.onload(); old.onerror();
assert.equal(f.image.src, 'new.png');
assert.equal(f.requests.at(-1).src, 'new.png');
// Default failure stops after one attempt, including after fallback.
const broken = fixture();
broken.load('missing.png'); broken.requests[0].onerror(); broken.requests[1].onerror();
assert.equal(broken.requests.length, 2);
assert.equal(broken.statuses.at(-1), 'error');
const empty = fixture();
empty.load(''); empty.requests[0].onload();
assert.equal(empty.image.src, 'default.png');
assert.equal(empty.statuses.at(-1), 'default');
// Mouth variants have independent state.
const closed = fixture(), open = fixture();
closed.load('closed.png'); open.load('bad-open.png');
closed.requests[0].onload(); open.requests[0].onerror(); open.requests[1].onload();
assert.equal(closed.image.src, 'closed.png');
assert.equal(open.image.src, 'default.png');
console.log('character image fallback, recovery, race and loop tests passed');
