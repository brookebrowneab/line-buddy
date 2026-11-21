import { asPcmWave } from './wav';
export type Recording = { stop: () => void; cancel: () => void };
export const canRecord = () => typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

/** Records locally; only transcribeRecording sends the completed clip to the server. */
export async function recordSpeech(onComplete: (audio: Blob) => void, onError: (message: string) => void, maxSeconds = 90): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  let recorder: MediaRecorder;
  try {
    const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported(t));
    recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  } catch (error) { stream.getTracks().forEach(t => t.stop()); throw error; }
  let cancelled = false, bytes = 0;
  const chunks: Blob[] = [];
  const release = () => stream.getTracks().forEach(t => t.stop());
  const cancel = () => { cancelled = true; clearTimeout(timer); if (recorder.state !== 'inactive') recorder.stop(); release(); };
  recorder.ondataavailable = e => {
    if (!e.data.size || cancelled) return;
    bytes += e.data.size;
    if (bytes > 7 * 1024 * 1024) { cancel(); onError('Recording is too large. Try a shorter speech.'); }
    else chunks.push(e.data);
  };
  recorder.onerror = () => { cancel(); onError('Recording stopped unexpectedly. Try again or use Browser.'); };
  recorder.onstop = () => {
    clearTimeout(timer); release();
    if (!cancelled) onComplete(new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type || 'audio/webm' }));
  };
  const timer = setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, maxSeconds * 1000);
  try { recorder.start(1000); } catch (error) { cancel(); throw error; }
  return { stop: () => { if (recorder.state !== 'inactive') recorder.stop(); }, cancel };
}

export async function transcribeRecording(audio: Blob, signal: AbortSignal, pcm = false): Promise<{ text: string; model: string }> {
  const file = pcm ? await asPcmWave(audio) : audio;
  if(signal.aborted)throw new Error('Recording was cancelled.');
  const form = new FormData(); form.append('audio', file, pcm ? 'speech.wav' : 'speech');
  const response = await fetch('/api/transcription', { method: 'POST', body: form, signal });
  let result;
  try { result = await response.json(); } catch { throw new Error('The transcription server is unavailable. Start it locally or use Browser.'); }
  if(response.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new Event('lines-class-unauthorized'));
  if (!response.ok) throw new Error(result.error || 'Transcription failed. Try Browser.');
  if (typeof result.text !== 'string') throw new Error('No transcript was returned. Try again.');
  return result;
}
