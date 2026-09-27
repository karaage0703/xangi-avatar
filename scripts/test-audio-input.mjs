import assert from 'node:assert/strict';
import { buildAudioConstraints, listAudioInputs, openAudioInput } from '../src/lib/audio-input.js';

assert.deepEqual(buildAudioConstraints('usb-mic'), {
  echoCancellation: true,
  noiseSuppression: true,
  deviceId: { exact: 'usb-mic' },
});
assert.deepEqual(buildAudioConstraints(), { echoCancellation: true, noiseSuppression: true });

const calls = [];
const fallbackStream = { id: 'default-stream' };
const fallbackDevices = {
  async getUserMedia(constraints) {
    calls.push(constraints);
    if (calls.length === 1) throw Object.assign(new Error('missing'), { name: 'NotFoundError' });
    return fallbackStream;
  },
};
assert.deepEqual(await openAudioInput(fallbackDevices, 'removed-device'), { stream: fallbackStream, fellBack: true });
assert.equal(calls[0].audio.deviceId.exact, 'removed-device');
assert.equal(calls[1].audio.deviceId, undefined);

const permissionError = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
await assert.rejects(() => openAudioInput({ getUserMedia: async () => { throw permissionError; } }, 'usb-mic'), permissionError);

assert.deepEqual(await listAudioInputs({ enumerateDevices: async () => [
  { kind: 'videoinput', deviceId: 'camera', label: 'Camera' },
  { kind: 'audioinput', deviceId: 'built-in', label: '' },
  { kind: 'audioinput', deviceId: 'usb', label: 'USB Mic' },
] }), [
  { deviceId: 'built-in', label: 'マイク 1' },
  { deviceId: 'usb', label: 'USB Mic' },
]);

console.log('audio input tests passed');
