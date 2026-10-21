// Native recognition may end on silence. Only an explicit stop submits the draft.
export class ManualRecognition {
  constructor(native, { onStart, onText, onPause, onSubmit, onClose, onError }) {
    Object.assign(this, { native, onSubmit, onClose });
    this.text = '';
    this.ended = false;
    this.closed = false;
    this.submitting = false;
    native.onstart = () => { if (!this.closed) onStart(); };
    native.onresult = event => {
      if (this.closed) return;
      this.text = Array.from(event.results).map(result => result[0]?.transcript || '').join('');
      onText(this.text);
    };
    native.onend = () => {
      if (this.closed) return;
      this.ended = true;
      if (this.submitting) this.finish();
      else onPause(this.text);
    };
    native.onerror = event => {
      if (this.closed || event.error === 'no-speech') return;
      this.abort();
      onError(event.error);
    };
  }
  start() { this.native.start(); }
  stop() {
    if (this.closed || this.submitting) return;
    this.submitting = true;
    if (this.ended) this.finish();
    else this.native.stop();
  }
  finish() {
    if (this.closed) return;
    this.closed = true;
    this.onClose();
    if (this.text.trim()) this.onSubmit(this.text.trim());
  }
  abort() {
    if (this.closed) return;
    this.closed = true;
    this.onClose();
    this.native.abort();
  }
}
