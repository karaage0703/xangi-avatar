// One response owns synthesis, ordered playback and cancellation together.
export class StreamingSpeech {
  constructor({ prepare, play, onDone = () => {}, onError = () => {} }) {
    Object.assign(this, { prepare, play, onDone, onError });
    this.controller = new AbortController();
    this.accepted = '';
    this.finished = false;
    this.preparing = Promise.resolve();
    this.playing = Promise.resolve();
  }

  update(snapshot, final = false) {
    if (this.finished || this.controller.signal.aborted) return;
    // Hold incomplete tags too, so streamed reply suggestions are never spoken.
    let text = String(snapshot || '');
    const tag = '<xangi_reply_suggestions>';
    const tagStart = text.indexOf(tag);
    if (tagStart >= 0) text = text.slice(0, tagStart);
    else {
      for (let length = 1; length < tag.length; length++) {
        if (text.endsWith(tag.slice(0, length))) { text = text.slice(0, -length); break; }
      }
    }
    // Completion may trim or reflow whitespace without changing spoken words.
    // Match that prefix while retaining the original spacing in new speech.
    const compact = (value) => value.replace(/\s/gu, '');
    const committed = compact(this.accepted);
    const incoming = compact(text);
    if (committed && incoming.startsWith(committed)) {
      let count = 0;
      let offset = 0;
      for (const char of text) {
        offset += char.length;
        if (!/\s/u.test(char)) count += char.length;
        if (count === committed.length) break;
      }
      this.accepted = text.slice(0, offset);
    } else if (final && incoming && committed.endsWith(incoming)) {
      // A final answer can omit commentary already included in the stream.
      text = this.accepted;
    }
    // A provider can replace its provisional response. Already spoken text cannot
    // be retracted. Wait for completion before speaking a replacement response.
    if (text.startsWith(this.accepted)) {
      let rest = text.slice(this.accepted.length);
      while (rest) {
        const boundary = /[。！？!?\n]|[.](?=\s)|[、,](?=\s|[^\x00-\x7f])/u.exec(rest);
        if (!boundary && !final) break;
        const end = boundary ? boundary.index + boundary[0].length : rest.length;
        const chunk = rest.slice(0, end);
        this.accepted += chunk;
        rest = rest.slice(end);
        if (chunk.trim()) this.enqueue(chunk.trim());
      }
    } else if (final && text.trim()) {
      // Tool-using agents may return a final answer distinct from commentary.
      // Preserve that answer rather than silently dropping it.
      this.enqueue(text.trim());
    }
    if (final) {
      this.finished = true;
      this.playing.then(() => {
        if (!this.controller.signal.aborted) this.onDone();
      });
    }
  }

  enqueue(text) {
    const { signal } = this.controller;
    const prepared = this.preparing.then(() => {
      if (!signal.aborted) return this.prepare(text, signal);
    });
    // Observe failures immediately, including while an earlier chunk plays.
    this.preparing = prepared.catch((error) => this.fail(error));
    this.playing = this.playing.then(async () => {
      const result = await prepared;
      if (!signal.aborted) await this.play(result, text, signal);
    }).catch((error) => this.fail(error));
  }

  fail(error) {
    if (this.controller.signal.aborted) return;
    this.cancel();
    this.onError(error);
  }

  cancel() { this.controller.abort(); }
}
