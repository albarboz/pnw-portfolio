import { CustomSource } from 'mediabunny';

interface Wait {
  end: number;
  done: () => void;
  fail: (e: unknown) => void;
}

/**
 * A file downloaded once, start to end, into memory, that can be read while it arrives (a read past what's in
 * waits for those bytes) and says when it's all in (`complete`).
 * Leaving the page stops the download (an open fetch keeps the page out of the back/forward cache); coming back
 * resumes it from the byte it stopped at, or from the start if the server sends the whole file again.
 */
export class StreamedFile {
  private got = 0;
  private waits: Wait[] = [];
  private error: unknown = null;
  private ctrl: AbortController | null = null;
  private allIn!: () => void;
  private failed!: (e: unknown) => void;
  /** Resolves once every byte is in; rejects if the download fails (or the file is disposed first). */
  readonly complete = new Promise<void>((resolve, reject) => ((this.allIn = resolve), (this.failed = reject)));

  private constructor(
    private url: string,
    private bytes: Uint8Array,
  ) {
    addEventListener('pagehide', this.pause);
    addEventListener('pageshow', this.resume);
    this.complete.catch(() => {}); // a failure reaches whoever awaits it; never an unhandled rejection
  }

  /** Starts the download; null if the server says no. Without a known length it waits for the whole file. */
  static async open(url: string): Promise<StreamedFile | null> {
    const ctrl = new AbortController();
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok || !res.body) return null;
    const size = Number(res.headers.get('content-length'));
    if (!size || res.headers.get('content-encoding')) {
      const file = new StreamedFile(url, new Uint8Array(await res.arrayBuffer()));
      file.got = file.bytes.length;
      file.allIn();
      return file;
    }
    const file = new StreamedFile(url, new Uint8Array(size));
    file.ctrl = ctrl;
    void file.fill(res.body, ctrl);
    return file;
  }

  /** A mediabunny source over this file. */
  source() {
    return new CustomSource({
      getSize: () => this.bytes.length,
      read: (start, end) => this.read(start, end),
      maxCacheSize: 0, // the bytes are all here already; don't keep a second copy
    });
  }

  dispose() {
    removeEventListener('pagehide', this.pause);
    removeEventListener('pageshow', this.resume);
    this.ctrl?.abort();
    this.ctrl = null;
    this.settle(new Error('disposed'));
  }

  private read(start: number, end: number): Uint8Array | Promise<Uint8Array> {
    if (end <= this.got) return this.bytes.subarray(start, end);
    if (this.error) return Promise.reject(this.error);
    return new Promise<void>((done, fail) => this.waits.push({ end, done, fail })).then(() =>
      this.bytes.subarray(start, end),
    );
  }

  private async fill(body: ReadableStream<Uint8Array>, ctrl: AbortController) {
    const reader = body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        this.bytes.set(value.subarray(0, this.bytes.length - this.got), this.got);
        this.got += value.length;
        this.waits = this.waits.filter((w) => (w.end <= this.got ? (w.done(), false) : true));
      }
      if (this.got < this.bytes.length) throw new Error('file ended early');
      if (this.ctrl === ctrl) this.ctrl = null;
      this.allIn();
    } catch (e) {
      if (!ctrl.signal.aborted) this.settle(e); // aborted on purpose: pause() or dispose()
    }
  }

  /** Fails every waiting read (and every later one past what's in). */
  private settle(e: unknown) {
    this.error = e;
    this.failed(e);
    for (const w of this.waits) w.fail(e);
    this.waits = [];
  }

  private pause = () => {
    if (!this.ctrl) return;
    this.ctrl.abort();
    this.ctrl = null;
  };

  private resume = (e: PageTransitionEvent) => {
    if (!e.persisted || this.ctrl || this.error || this.got >= this.bytes.length) return;
    const ctrl = (this.ctrl = new AbortController());
    fetch(this.url, { signal: ctrl.signal, headers: { Range: `bytes=${this.got}-` } }).then(
      (res) => {
        if (res.status === 200) this.got = 0; // no ranges here: the same bytes again from the start
        else if (res.status !== 206 || !res.body) throw new Error(`resume: ${res.status}`);
        return this.fill(res.body!, ctrl);
      },
      (err) => {
        if (!ctrl.signal.aborted) this.settle(err);
      },
    ).catch((err) => this.settle(err));
  };
}
