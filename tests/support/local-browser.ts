import { vi } from 'vitest';
/** Browser API doubles, not mocks of Lines modules. Model inference is exercised separately in the browser. */
export function localBrowser() {
  const jobs: any[] = [], workers: TestWorker[] = [], contexts: number[][] = [];
  let postFailure = false;
  let duration = 1, transcript = 'Wherefore art thou Romeo?', hold = false;
  const pcm = new Float32Array(16000).fill(.1);
  class TestWorker {
    onmessage: ((e: any) => void) | null = null;
    onerror: (() => void) | null = null;
    terminated = false;
    constructor() { workers.push(this); }
    postMessage(job: any) {
      if(postFailure){postFailure=false;throw new Error('Worker could not start');}
      jobs.push(job);
      if (!hold) queueMicrotask(() => this.reply(job.type === 'init' ? {} : { text: transcript }));
    }
    reply(extra: any = {}) { this.onmessage?.({ data: { type: 'done', id: jobs.at(-1).id, model: 'Local test runtime', ...extra } }); }
    progress() { this.onmessage?.({ data: { type: 'progress', phase: 'loading', message: 'Downloading speech model', progress: 40 } }); }
    terminate() { this.terminated = true; }
  }
  class AudioContext {
    destination = {};
    constructor(...args: number[]) { contexts.push(args); }
    async decodeAudioData() { return { duration }; }
    createBufferSource() { return { buffer: null, connect() {}, start() {} }; }
    async startRendering() { return { getChannelData: () => pcm }; }
  }
  vi.stubGlobal('Worker', TestWorker);
  vi.stubGlobal('OfflineAudioContext', AudioContext);
  if (typeof document === 'undefined') vi.stubGlobal('document', { baseURI: 'http://localhost/' });
  const network = vi.fn(() => { throw new Error('Unexpected network request'); });
  vi.stubGlobal('fetch', network);
  return { jobs, workers, contexts, network, pcm,
    setDuration: (value: number) => { duration = value; },
    setTranscript: (value: string) => { transcript = value; },
    hold: () => { hold = true; },
    failPost: () => { postFailure = true; },
  };
}
