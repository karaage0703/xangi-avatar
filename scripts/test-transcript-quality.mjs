import assert from 'node:assert/strict';
import { assessTranscript } from '../src/lib/transcript-quality.js';

assert.equal(assessTranscript({ text: '' }).accepted, false);
assert.equal(assessTranscript({ text: 'ノイズ', speechSeconds: 0.2, averageLogProbability: -0.1, noSpeechProbability: 0.01 }).accepted, false);
assert.equal(assessTranscript({ text: 'では', speechSeconds: 0.8, averageLogProbability: -0.4, noSpeechProbability: 0.1 }).accepted, false);
assert.equal(assessTranscript({ text: 'バーベキュー', speechSeconds: 1.2, averageLogProbability: -0.2, noSpeechProbability: 0.55 }).accepted, false);
assert.deepEqual(assessTranscript({ text: 'ゲーム実況を始めます', speechSeconds: 1.4, averageLogProbability: -0.2, noSpeechProbability: 0.05 }), { accepted: true, text: 'ゲーム実況を始めます' });
assert.equal(assessTranscript({ text: 'はい' }).accepted, true, 'old servers without quality metrics remain compatible');

console.log('transcript quality tests passed');
