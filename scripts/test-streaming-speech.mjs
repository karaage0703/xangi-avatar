import assert from 'node:assert/strict';
import { StreamingSpeech } from '../src/lib/streaming-speech.js';
const tick = () => new Promise((resolve) => setImmediate(resolve));
const prepared = [], played = [];
let finishFirst, done = 0;
const queue = new StreamingSpeech({
  prepare: async (text) => { prepared.push(text); return text; },
  play: async (value) => { played.push(value); if (played.length === 1) await new Promise((resolve) => { finishFirst = resolve; }); },
  onDone: () => { done++; },
  onError: (error) => { throw error; },
});
queue.update('最初');
await tick();
assert.deepEqual(prepared, []);
queue.update('最初の文。');
await tick();
assert.deepEqual(played, ['最初の文。'], 'first audio starts before turn completion');
queue.update('最初の文。次の文！末尾');
await tick();
assert.deepEqual(prepared, ['最初の文。', '次の文！'], 'next synthesis overlaps previous playback');
assert.deepEqual(played, ['最初の文。'], 'audio must not overlap');
queue.update('最初の文。次の文！末尾', true);
await tick();
assert.equal(done, 0, 'microphone stays paused until all audio ends');
finishFirst();
await tick();
assert.deepEqual(played, ['最初の文。', '次の文！', '末尾']);
assert.equal(done, 1);
queue.update('最初の文。次の文！末尾', true);
await tick();
assert.equal(done, 1, 'duplicate completion is ignored');

const hidden = [];
const tags = new StreamingSpeech({ prepare: async (text) => text, play: async (_, text) => hidden.push(text) });
for (const text of ['Hello. ', 'Hello. World!<xangi_rep', 'Hello. World!<xangi_reply_suggestions>["Never speak."]']) tags.update(text);
tags.update('Hello. World!<xangi_reply_suggestions>["Never speak."]', true);
await tick();
assert.deepEqual(hidden, ['Hello.', 'World!']);

let resolvePrepare, canceledPlays = 0;
const canceled = new StreamingSpeech({
  prepare: () => new Promise((resolve) => { resolvePrepare = resolve; }),
  play: () => { canceledPlays++; },
  onDone: () => { throw new Error('canceled turn completed'); },
});
canceled.update('古い返答。', true);
await tick();
canceled.cancel();
resolvePrepare('audio');
await tick();
assert.equal(canceledPlays, 0);

let errors = 0;
const failed = new StreamingSpeech({ prepare: async () => { throw new Error('tts unavailable'); }, play: () => assert.fail(), onError: () => errors++, onDone: () => assert.fail() });
failed.update('一文。二文。', true);
await tick();
assert.equal(errors, 1);

const replaced = [];
const replacement = new StreamingSpeech({ prepare: async (text) => text, play: async (text) => replaced.push(text) });
replacement.update('確定した文。途中');
replacement.update('確定した文。書き直した末尾', true);
await tick();
assert.deepEqual(replaced, ['確定した文。', '書き直した末尾']);
console.log('streaming speech: early playback, prefetch, order, final flush, tags, duplicate, cancel, failure and revision passed');

const finalAnswer = [];
const revised = new StreamingSpeech({ prepare: async (text) => text, play: async (text) => finalAnswer.push(text) });
revised.update('確認します。');
revised.update('結果をまとめました。', true);
await tick();
assert.deepEqual(finalAnswer, ['確認します。', '結果をまとめました。'], 'a distinct final answer after tool commentary must not be dropped');

for (const [delta, final, expected] of [
  ['こんにちは。\n', 'こんにちは。', ['こんにちは。']],
  ['  Hello.\nWorld!\n', 'Hello. World!', ['Hello.', 'World!']],
  ['一文です。\n', '一文です。次の文です。', ['一文です。', '次の文です。']],
  ['確認します。\n答えです。\n', '答えです。', ['確認します。', '答えです。']],
]) {
  const spoken = [];
  const q = new StreamingSpeech({ prepare: async text => text, play: async text => spoken.push(text) });
  q.update(delta);
  q.update(final, true);
  await q.playing;
  assert.deepEqual(spoken, expected, 'whitespace-only changes must not repeat speech');
}
console.log('completion whitespace and already-streamed final answer regressions passed');
