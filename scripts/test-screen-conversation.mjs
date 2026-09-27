import assert from 'node:assert/strict';
import { ScreenConversation, buildScreenConversationPrompt, fitCaptureSize } from '../src/lib/screen-conversation.js';

assert.deepEqual(fitCaptureSize(2560, 1440), { width: 1280, height: 720 });
assert.deepEqual(fitCaptureSize(800, 600), { width: 800, height: 600 });
const prompt = buildScreenConversationPrompt('次はどこへ行けばいい？', '/workspace/frame.jpg');
assert.match(prompt, /利用者の発話: 次はどこへ行けばいい？/);
assert.match(prompt, /\[添付ファイル\]\n  - \/workspace\/frame\.jpg/);
assert.equal(buildScreenConversationPrompt('Hello', '/workspace/frame.jpg'), '利用者の発話: Hello\n\n[添付ファイル]\n  - /workspace/frame.jpg');
assert.doesNotMatch(prompt, /コンテキストとして確認してください/);

let ended;
let stopped = 0;
const changes = [];
const states = [];
const frames = [];
let started = 0;
const track = {
  addEventListener(name, callback) { if (name === 'ended') ended = callback; },
  stop() { stopped += 1; },
};
const stream = { getVideoTracks: () => [track], getTracks: () => [track] };
const video = { readyState: 1, videoWidth: 1920, videoHeight: 1080, play: async () => {}, srcObject: null };
const canvas = {
  getContext: () => ({ drawImage: (...args) => frames.push(args.slice(1)) }),
  toBlob: (callback) => callback(new Blob(['jpeg'], { type: 'image/jpeg' })),
};
const conversation = new ScreenConversation({
  mediaDevices: { getDisplayMedia: async (options) => {
    assert.equal(options.audio, false);
    assert.equal(options.video.frameRate.max, 2);
    return stream;
  } },
  createVideo: () => video,
  createCanvas: () => canvas,
  onStart: async () => { started += 1; },
  onChange: (active) => changes.push(active),
  onState: (state) => states.push(state),
});

await conversation.start();
assert.equal(started, 1);
assert.equal(conversation.active, true);
assert.equal(frames.length, 0, 'starting screen share must not send a frame');
assert.match(states.at(-1), /音声またはテキスト/);
const captured = await conversation.capture();
assert.equal(captured.type, 'image/jpeg');
assert.deepEqual(frames[0], [0, 0, 1280, 720]);
assert.deepEqual(changes, [true]);
assert.match(states.at(-1), /音声またはテキスト/);
ended();
assert.equal(conversation.active, false);
assert.equal(stopped, 1);
assert.deepEqual(changes, [true, false]);
assert.match(states.at(-1), /Macで共有/);

console.log('screen conversation tests passed');
