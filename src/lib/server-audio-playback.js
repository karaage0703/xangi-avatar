export class ServerAudioPlayback {
  constructor(Context = globalThis.AudioContext || globalThis.webkitAudioContext) {
    this.Context = Context;
    this.context = null;
    this.source = null;
    this.unlocking = null;
  }

  unlock() {
    if (!this.Context) return Promise.resolve(false);
    if (!this.context || this.context.state === 'closed') this.context = new this.Context();
    if (this.context.state === 'running') return Promise.resolve(true);
    if (!this.unlocking) {
      this.unlocking = this.context.resume()
        .then(() => this.context.state === 'running')
        .catch(() => false)
        .finally(() => { this.unlocking = null; });
    }
    return this.unlocking;
  }

  async play(blob, { canStart = () => true, onStart = () => {}, onEnd = () => {} } = {}) {
    if (this.unlocking) await this.unlocking;
    if (!this.context || this.context.state !== 'running') {
      throw new Error('スマホでは先に「声を試す」を押して音声を有効にしてください。');
    }
    this.stop();
    const buffer = await this.context.decodeAudioData(await blob.arrayBuffer());
    if (!canStart()) return false;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    source.onended = () => {
      source.disconnect();
      if (this.source === source) this.source = null;
      onEnd();
    };
    this.source = source;
    source.start();
    onStart();
    return true;
  }

  stop() {
    if (!this.source) return;
    this.source.onended = null;
    this.source.stop();
    this.source.disconnect();
    this.source = null;
  }
}
