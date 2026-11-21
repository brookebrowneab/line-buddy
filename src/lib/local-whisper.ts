export type WhisperState = {
  phase: 'idle' | 'loading' | 'ready' | 'transcribing' | 'error';
  message: string;
  progress?: number;
};
type LocalResult = { model: string; text?: string };
type WorkerResponse =
  | ({ type: 'progress' } & WhisperState)
  | { type: 'error'; id: number; message: string }
  | ({ type: 'done'; id: number } & LocalResult);
let state: WhisperState = { phase: 'idle', message: 'The speech model downloads once, then runs on this device.' };
const listeners = new Set<() => void>();
export const whisperState = () => state;
export const subscribeWhisper = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
function update(next: WhisperState) {
  state = next;
  for (const listener of listeners) listener();
}
let worker: Worker | null = null, id = 0;
let pending: { id: number; resolve: (value: LocalResult) => void; reject: (reason: Error) => void } | null = null;
let ready = false;
/** Every failure/cancellation relinquishes the same worker and pending job. */
function fail(error: Error, next: WhisperState = { phase: 'error', message: error.message }) {
  const job = pending;
  pending = null;
  worker?.terminate();
  worker = null;
  ready = false;
  update(next);
  job?.reject(error);
}
export function cancelWhisper() {
  fail(new Error('Speech checking was cancelled.'), {
    phase: 'idle', message: 'Speech checking cancelled. The model download is cached when supported.',
  });
}
function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
    if (data.type === 'progress') { update(data); return; }
    if (data.id !== pending?.id) return;
    if (data.type === 'error') {
      fail(new Error(import.meta.env.DEV ? data.message : 'Local speech checking could not start. Try again or use typing.'));
      return;
    }
    const job = pending;
    pending = null;
    ready = true;
    update({ phase: 'ready', message: `${data.model} ready. Audio stays on this device.`, progress: 100 });
    job?.resolve(data);
  };
  worker.onerror = () => fail(new Error('This browser could not run local speech checking. Try a shorter take or use typing.'));
  return worker;
}
function run(type: 'init' | 'transcribe', signal: AbortSignal, extra: Record<string, unknown> = {}, transfer: Transferable[] = []): Promise<LocalResult> {
  if (signal.aborted) return Promise.reject(new Error('Speech checking was cancelled.'));
  if (pending) return Promise.reject(new Error('Speech checking is already running.'));
  return new Promise((resolve, reject) => {
    const abort = () => cancelWhisper();
    signal.addEventListener('abort', abort, { once: true });
    pending = {
      id: ++id,
      resolve: value => { signal.removeEventListener('abort', abort); resolve(value); },
      reject: error => { signal.removeEventListener('abort', abort); reject(error); },
    };
    update({ phase: type === 'init' ? 'loading' : 'transcribing', message: type === 'init' ? 'Preparing local speech recognition…' : 'Checking your speech on this device…' });
    try { getWorker().postMessage({ id, type, runtimeRoot: new URL('vendor/ort/', document.baseURI).href, ...extra }, transfer); }
    catch (error) { fail(error instanceof Error ? error : new Error('Local speech checking failed. Try again or use typing.')); }
  });
}
export async function initializeWhisper(signal: AbortSignal) {
  if (!ready) await run('init', signal);
}
export async function transcribePcm(audio: Float32Array, signal: AbortSignal, targetLine: string, previousContextLines: string[] = []) {
  await initializeWhisper(signal);
  const result = await run('transcribe', signal, { audio, targetLine, previousContextLines }, [audio.buffer]);
  if (typeof result.text !== 'string') throw new Error('Local speech checking returned no transcript. Try again or use typing.');
  return { text: result.text, model: result.model };
}
