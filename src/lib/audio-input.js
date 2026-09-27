export const DEFAULT_AUDIO_INPUT = '';

export function buildAudioConstraints(deviceId = DEFAULT_AUDIO_INPUT) {
  return {
    echoCancellation: true,
    noiseSuppression: true,
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  };
}

export async function openAudioInput(mediaDevices, deviceId = DEFAULT_AUDIO_INPUT) {
  if (!mediaDevices?.getUserMedia) throw new Error('マイクを利用できません。');
  try {
    return {
      stream: await mediaDevices.getUserMedia({ audio: buildAudioConstraints(deviceId), video: false }),
      fellBack: false,
    };
  } catch (error) {
    if (!deviceId || !['NotFoundError', 'OverconstrainedError'].includes(error?.name)) throw error;
    return {
      stream: await mediaDevices.getUserMedia({ audio: buildAudioConstraints(), video: false }),
      fellBack: true,
    };
  }
}

export async function listAudioInputs(mediaDevices) {
  if (!mediaDevices?.enumerateDevices) return [];
  const devices = await mediaDevices.enumerateDevices();
  return devices
    .filter(({ kind }) => kind === 'audioinput')
    .map(({ deviceId, label }, index) => ({ deviceId, label: label || `マイク ${index + 1}` }));
}
