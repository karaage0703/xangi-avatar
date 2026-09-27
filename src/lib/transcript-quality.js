function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function assessTranscript(result) {
  const text = String(result?.text || '').trim();
  if (!text) return { accepted: false, reason: '音声を認識できませんでした。' };

  const speechSeconds = finiteNumber(result.speechSeconds);
  const averageLogProbability = finiteNumber(result.averageLogProbability);
  const noSpeechProbability = finiteNumber(result.noSpeechProbability);
  const compactLength = text.replace(/[\s。、，.!！?？]/gu, '').length;

  if (speechSeconds !== null && speechSeconds < 0.3) {
    return { accepted: false, reason: `発話が短すぎたため「${text}」は送信しませんでした。` };
  }
  if (noSpeechProbability !== null && noSpeechProbability >= 0.5) {
    return { accepted: false, reason: `音声の確信度が低いため「${text}」は送信しませんでした。` };
  }
  if (averageLogProbability !== null && averageLogProbability <= -0.8) {
    return { accepted: false, reason: `認識の確信度が低いため「${text}」は送信しませんでした。` };
  }
  if (compactLength <= 4 && (
    (noSpeechProbability !== null && noSpeechProbability >= 0.25)
    || (averageLogProbability !== null && averageLogProbability <= -0.35)
  )) {
    return { accepted: false, reason: `短い低信頼の認識「${text}」は送信しませんでした。` };
  }
  return { accepted: true, text };
}
