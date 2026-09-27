// Endpoint detection uses microphone energy, not speech recognition.
export class SpeechBoundary {
  constructor(now = 0) { this.reset(now); }
  reset(now) {
    this.started = now;
    this.voiceMs = 0;
    this.lastVoice = now;
    this.lastTick = now;
    this.ready = false;
    this.noiseSamples = [];
    this.noiseFloor = 0;
    this.threshold = 0.018;
    this.peakRms = 0;
  }
  update(rms, now) {
    const elapsed = Math.min(100, now - this.lastTick);
    this.lastTick = now;
    this.peakRms = Math.max(this.peakRms, rms);
    if (!this.ready) {
      this.noiseSamples.push(rms);
      if (now - this.started < 600) return null;
      const sorted = [...this.noiseSamples].sort((a, b) => a - b);
      this.noiseFloor = sorted[Math.floor(sorted.length / 2)] || 0;
      this.threshold = Math.min(0.05, Math.max(0.018, this.noiseFloor + Math.max(0.012, this.noiseFloor * 0.75)));
      this.ready = true;
      this.lastVoice = now;
      return 'ready';
    }
    if (rms > this.threshold) { this.voiceMs += elapsed; this.lastVoice = now; }
    const heard = this.voiceMs >= 400;
    if (heard && (now - this.lastVoice >= 1000 || now - this.started >= 20000)) return 'send';
    if (!heard && now - this.started >= 20000) return 'discard';
    return null;
  }
  metrics(now) {
    return {
      durationMs: Math.max(0, Math.round(now - this.started)),
      voiceMs: Math.round(this.voiceMs),
      noiseFloor: Number(this.noiseFloor.toFixed(4)),
      threshold: Number(this.threshold.toFixed(4)),
      peakRms: Number(this.peakRms.toFixed(4)),
    };
  }
}

export class HandsFree {
  constructor({ onAudio, onCalibrating, onListening, onChange, onError, requestStream }) {
    Object.assign(this, { onAudio, onCalibrating, onListening, onChange, onError, requestStream });
    this.active = false;
    this.muted = false;
    this.version = 0;
  }
  async start() {
    if (this.active) return;
    this.active = true;
    const version = ++this.version;
    this.onChange(true);
    try {
      if ((!this.requestStream && !navigator.mediaDevices?.getUserMedia) || !globalThis.MediaRecorder) throw new Error('連続会話にはHTTPSと録音対応ブラウザが必要です。');
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      this.context = new Context();
      await this.context.resume();
      const stream = this.requestStream
        ? await this.requestStream()
        : await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (!this.active || version !== this.version) { stream.getTracks().forEach((track) => track.stop()); return; }
      this.stream = stream;
      this.source = this.context.createMediaStreamSource(stream);
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 2048;
      this.source.connect(this.analyser);
      this.samples = new Float32Array(this.analyser.fftSize);
      stream.getAudioTracks()[0].onended = () => this.fail(new Error('マイクとの接続が切れました。会話を開始し直してください。'));
      this.resume();
    } catch (error) { if (version === this.version) this.fail(error); }
  }
  resume() {
    if (!this.active || !this.stream || this.muted) return;
    this.pause();
    const version = this.version;
    // Let the loudspeaker's tail decay before enabling input again.
    this.resumeTimer = setTimeout(() => {
      if (!this.active || version !== this.version) return;
      this.stream.getTracks().forEach((track) => { track.enabled = true; });
      this.record();
    }, 400);
  }
  record() {
    if (!this.active) return;
    const version = this.version;
    const recorder = new MediaRecorder(this.stream);
    this.recorder = recorder;
    const chunks = [];
    let submit = false;
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = () => this.fail(new Error('録音に失敗しました。会話を開始し直してください。'));
    recorder.onstop = async () => {
      if (this.recorder === recorder) this.recorder = null;
      if (!this.active || version !== this.version) return;
      if (!submit) { this.record(); return; }
      try { await this.onAudio(new Blob(chunks, { type: recorder.mimeType }), version, boundary.metrics(performance.now())); }
      catch (error) { if (version === this.version) this.fail(error); }
    };
    const boundary = new SpeechBoundary(performance.now());
    recorder.start();
    this.onCalibrating?.();
    this.timer = setInterval(() => {
      this.analyser.getFloatTimeDomainData(this.samples);
      const rms = Math.sqrt(this.samples.reduce((sum, value) => sum + value * value, 0) / this.samples.length);
      const result = boundary.update(rms, performance.now());
      if (!result) return;
      if (result === 'ready') { this.onListening(); return; }
      clearInterval(this.timer);
      submit = result === 'send';
      if (submit) this.stream.getTracks().forEach((track) => { track.enabled = false; });
      recorder.stop();
    }, 50);
  }
  pause() {
    ++this.version;
    clearTimeout(this.resumeTimer);
    clearInterval(this.timer);
    if (this.recorder?.state === 'recording') this.recorder.stop();
    this.recorder = null;
    this.stream?.getTracks().forEach((track) => { track.enabled = false; });
  }
  setMuted(muted) {
    const nextMuted = Boolean(muted);
    if (this.muted === nextMuted) return;
    this.muted = nextMuted;
    if (nextMuted) this.pause();
    else this.resume();
  }
  stop() {
    this.active = false;
    this.pause();
    this.stream?.getTracks().forEach((track) => { track.onended = null; track.stop(); });
    this.stream = null;
    this.source?.disconnect();
    this.source = null;
    void this.context?.close().catch(() => {});
    this.context = null;
    this.onChange(false);
  }
  fail(error) { this.stop(); this.onError(error); }
}
