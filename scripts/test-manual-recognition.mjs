import assert from 'node:assert/strict';
import { ManualRecognition } from '../src/lib/manual-recognition.js';
function setup() {
  const sent = [], paused = [], errors = [];
  let stops = 0, closes = 0;
  const native = { start() {}, stop() { stops++; }, abort() { this.onend(); } };
  const session = new ManualRecognition(native, {
    onStart() {}, onText() {}, onPause: text => paused.push(text),
    onSubmit: text => sent.push(text), onClose: () => closes++, onError: e => errors.push(e),
  });
  const result = text => native.onresult({ results: [[{ transcript: text }]] });
  return { native, session, result, sent, paused, errors, get stops() { return stops; }, get closes() { return closes; } };
}
const silent = setup();
silent.result('話の途中'); silent.native.onend();
assert.deepEqual(silent.sent, []);
assert.deepEqual(silent.paused, ['話の途中']);
silent.session.stop(); silent.session.stop(); silent.native.onend();
assert.deepEqual(silent.sent, ['話の途中']);
assert.equal(silent.closes, 1);
const explicit = setup();
explicit.result('途中'); explicit.session.stop();
assert.equal(explicit.stops, 1);
assert.deepEqual(explicit.sent, []);
explicit.result('確定した文章'); explicit.native.onend();
assert.deepEqual(explicit.sent, ['確定した文章']);
const cancelled = setup();
cancelled.result('送信しない'); cancelled.session.abort(); cancelled.native.onend(); cancelled.session.stop();
assert.deepEqual(cancelled.sent, []);
const empty = setup(); empty.native.onerror({ error: 'no-speech' }); empty.native.onend(); empty.session.stop();
assert.deepEqual(empty.sent, []);
const error = setup(); error.result('送信しない'); error.native.onerror({ error: 'not-allowed' }); error.session.stop();
assert.deepEqual(error.sent, []); assert.deepEqual(error.errors, ['not-allowed']);
console.log('manual recognition: silence holds, explicit submit, final result, cancel, empty and error passed');
