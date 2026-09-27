export function fitCaptureSize(width, height, maxWidth = 1280) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const scale = Math.min(1, maxWidth / safeWidth);
  return { width: Math.round(safeWidth * scale), height: Math.round(safeHeight * scale) };
}

export function buildScreenConversationPrompt(spokenText, imagePath) {
  return [
    `利用者の発話: ${String(spokenText || '').trim()}`,
    '',
    '[添付ファイル]',
    `  - ${imagePath}`,
  ].join('\n');
}

function waitForVideo(video) {
  if (video.readyState >= 1 && video.videoWidth > 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = () => reject(new Error('共有画面を読み込めませんでした。'));
  });
}

export class ScreenConversation {
  constructor({
    mediaDevices = globalThis.navigator?.mediaDevices,
    createVideo = () => document.createElement('video'),
    createCanvas = () => document.createElement('canvas'),
    onStart = async () => {},
    onChange = () => {},
    onState = () => {},
  } = {}) {
    this.mediaDevices = mediaDevices;
    this.createVideo = createVideo;
    this.createCanvas = createCanvas;
    this.onStart = onStart;
    this.onChange = onChange;
    this.onState = onState;
    this.stream = null;
    this.video = null;
    this.busy = false;
  }

  get active() { return Boolean(this.stream); }

  async start() {
    if (this.active) return;
    if (!this.mediaDevices?.getDisplayMedia) throw new Error('このブラウザは画面共有に対応していません。MacのChromeで開いてください。');
    const stream = await this.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 1, max: 2 } },
      audio: false,
    });
    const track = stream.getVideoTracks()[0];
    if (!track) { stream.getTracks().forEach((item) => item.stop()); throw new Error('共有できる映像がありません。'); }
    const video = this.createVideo();
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    try {
      await waitForVideo(video);
      await video.play();
      await this.onStart();
    } catch (error) {
      stream.getTracks().forEach((item) => item.stop());
      video.srcObject = null;
      throw error;
    }
    this.stream = stream;
    this.video = video;
    track.addEventListener('ended', () => this.stop());
    this.onChange(true);
    this.onState('共有中・音声またはテキストを送信した時点の画面を取得します');
  }

  async capture() {
    if (!this.active) throw new Error('画面が共有されていません。');
    if (this.busy) throw new Error('画面を取得中です。');
    this.busy = true;
    try {
      this.onState('送信時点の画面を取得中…');
      const { width, height } = fitCaptureSize(this.video.videoWidth, this.video.videoHeight);
      const canvas = this.createCanvas();
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('画面画像を作成できませんでした。');
      context.drawImage(this.video, 0, 0, width, height);
      const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('画面画像を作成できませんでした。')), 'image/jpeg', 0.72));
      return blob;
    } finally {
      this.busy = false;
      if (this.active) this.onState('共有中・音声またはテキストを送信した時点の画面を取得します');
    }
  }

  stop() {
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.video) this.video.srcObject = null;
    const changed = this.active;
    this.stream = null;
    this.video = null;
    this.busy = false;
    if (changed) this.onChange(false);
    this.onState('Macで共有するウィンドウを選ぶと、送信時の画面もAIへ送ります。');
  }
}
