import assert from 'node:assert/strict';
import { ServerAudioPlayback } from '../src/lib/server-audio-playback.js';

let resumeCalls = 0;
let starts = 0;
let disconnects = 0;
let createdSource;

class FakeContext {
  constructor() {
    this.state = 'suspended';
    this.destination = {};
  }
  async resume() {
    resumeCalls += 1;
    this.state = 'running';
  }
  async decodeAudioData(bytes) {
    assert.equal(bytes.byteLength, 4);
    return { duration: 1 };
  }
  createBufferSource() {
    createdSource = {
      connect(destination) { assert.ok(destination); },
      disconnect() { disconnects += 1; },
      start() { starts += 1; },
      stop() {},
      onended: null,
      buffer: null,
    };
    return createdSource;
  }
}

const locked = new ServerAudioPlayback(FakeContext);
await assert.rejects(() => locked.play(new Blob(['test'])), /声を試す/);
assert.equal(await locked.unlock(), true);
assert.equal(resumeCalls, 1);
assert.equal(await locked.unlock(), true);
assert.equal(resumeCalls, 1);

let started = 0;
let ended = 0;
await locked.play(new Blob(['test']), { onStart: () => { started += 1; }, onEnd: () => { ended += 1; } });
assert.equal(starts, 1);
assert.equal(started, 1);
createdSource.onended();
assert.equal(ended, 1);
assert.equal(disconnects, 1);

const canceled = new ServerAudioPlayback(FakeContext);
await canceled.unlock();
assert.equal(await canceled.play(new Blob(['test']), { canStart: () => false }), false);
assert.equal(starts, 1);

const unsupported = new ServerAudioPlayback(null);
assert.equal(await unsupported.unlock(), false);

console.log('server audio playback unlock and reuse tests passed');
