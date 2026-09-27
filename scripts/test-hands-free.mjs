import assert from 'node:assert/strict';
import { SpeechBoundary, HandsFree } from '../src/lib/hands-free.js';

const silent = new SpeechBoundary(0);
for (let time = 50; time < 600; time += 50) assert.equal(silent.update(0.01, time), null);
assert.equal(silent.update(0.01, 600), 'ready');
for (let time = 650; time < 20000; time += 50) assert.equal(silent.update(0.01, time), null);
assert.equal(silent.update(0, 20000), 'discard');
const noise = new SpeechBoundary(0);
for (let time = 50; time < 600; time += 50) assert.equal(noise.update(0.02, time), null);
assert.equal(noise.update(0.02, 600), 'ready');
assert.ok(noise.threshold > 0.02);
noise.update(0.2, 650);
for (let time = 700; time <= 1700; time += 50) assert.equal(noise.update(0, time), null);
const speech = new SpeechBoundary(0);
for (let time = 50; time < 600; time += 50) assert.equal(speech.update(0.005, time), null);
assert.equal(speech.update(0.005, 600), 'ready');
for (let time = 650; time <= 1050; time += 50) assert.equal(speech.update(0.05, time), null);
for (let time = 1100; time < 2050; time += 50) assert.equal(speech.update(0, time), null);
assert.equal(speech.update(0, 2050), 'send');
const long = new SpeechBoundary(0);
for (let time = 50; time < 600; time += 50) assert.equal(long.update(0, time), null);
assert.equal(long.update(0, 600), 'ready');
for (let time = 650; time < 20000; time += 50) assert.equal(long.update(0.05, time), null);
assert.equal(long.update(0.05, 20000), 'send');

// Ending the conversation while permission is pending must release the late stream.
let resolveStream;
let stopped = false;
let closed = false;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: () => new Promise((resolve) => { resolveStream = resolve; }) } } });
globalThis.AudioContext = class { resume() { return Promise.resolve(); } close() { closed = true; return Promise.resolve(); } };
globalThis.MediaRecorder = class {};
const session = new HandsFree({ onChange() {}, onAudio() { assert.fail('unexpected upload'); }, onListening() { assert.fail('unexpected recording'); }, onError(error) { throw error; } });
const starting = session.start();
await Promise.resolve();
session.stop();
resolveStream({ getTracks: () => [{ stop() { stopped = true; } }] });
await starting;
assert.equal(session.active, false);
assert.equal(stopped, true);
assert.equal(closed, true);

let paused = 0;
let resumed = 0;
const mutedSession = new HandsFree({ onChange() {}, onAudio() {}, onError(error) { throw error; } });
mutedSession.active = true;
mutedSession.pause = () => { paused += 1; };
mutedSession.resume = () => { resumed += 1; };
mutedSession.setMuted(true);
mutedSession.setMuted(true);
assert.equal(mutedSession.muted, true);
assert.equal(paused, 1);
mutedSession.setMuted(false);
mutedSession.setMuted(false);
assert.equal(mutedSession.muted, false);
assert.equal(resumed, 1);

console.log('hands-free silence, endpoint, duration, cancellation and mute tests passed');
