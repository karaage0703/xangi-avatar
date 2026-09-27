import assert from 'node:assert/strict';
import { splitBubblePages } from '../src/lib/bubble-pages.js';

assert.deepEqual(splitBubblePages(''), []);
assert.deepEqual(splitBubblePages('短い返答です。', 80), ['短い返答です。']);

const longText = '最初の説明です。'.repeat(12) + '最後まで表示します。';
const pages = splitBubblePages(longText, 50);
assert.ok(pages.length > 1);
assert.ok(pages.every((page) => page.length <= 50));
assert.equal(pages.join(''), longText);
assert.ok(pages.slice(0, -1).every((page) => /[。！？!?…]$/u.test(page)));

const unbroken = 'あ'.repeat(105);
assert.deepEqual(splitBubblePages(unbroken, 40).map((page) => page.length), [40, 40, 25]);

console.log('bubble pagination tests passed');
