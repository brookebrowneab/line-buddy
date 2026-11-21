import { asFloat32Pcm } from './wav';
import { transcribePcm } from './local-whisper';
import { compareSpeech } from './speech-match';
export type Recording = { stop: () => void; cancel: () => void };
export const canRecord = () => typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

/** Microphone clips remain in memory and are processed only on this device. */
export async function recordSpeech(onComplete: (audio: Blob) => void, onError: (message: string) => void, maxSeconds = 90): Promise<Recording> {
  let stream: MediaStream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (error) {
    if (error && typeof error === 'object' && 'name' in error && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) {
      throw new Error('Microphone permission denied. Allow microphone access in your browser to retry, or type instead.');
    }
    throw new Error('Could not open the microphone. Check that it is connected, then retry or type instead.');
  }
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
  recorder.onerror = () => { cancel(); onError('Recording stopped unexpectedly. Try again or type your answer.'); };
  recorder.onstop = () => {
    clearTimeout(timer); release();
    if (!cancelled) onComplete(new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type || 'audio/webm' }));
  };
  const timer = setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, maxSeconds * 1000);
  try { recorder.start(1000); } catch (error) { cancel(); throw error; }
  return { stop: () => { if (recorder.state !== 'inactive') recorder.stop(); }, cancel };
}

export async function transcribeRecording(audio: Blob, signal: AbortSignal, targetLine: string, previousContextLines: string[] = []) {
  if(signal.aborted)throw new Error('Recording was cancelled.');
  const samples = await asFloat32Pcm(audio);
  if(signal.aborted)throw new Error('Recording was cancelled.');
  const result = await transcribePcm(samples,signal,targetLine,previousContextLines);
  return {text:result.text as string,model:result.model as string,...compareSpeech(targetLine,result.text)};
}
