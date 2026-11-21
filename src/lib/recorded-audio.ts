import data from '../data/recordings.json';
export type RecordingClip = { role: string; text: string; src: string; fingerprint: string; cue: { text: string; start: number } };
export type RecordingIndex = { version: number; model: string; clips: Record<string, RecordingClip> };
const index = data as RecordingIndex;
const normalized = (text: string) => text.replace(/\s+/g, ' ').trim();
export function findRecording(speechId: string | undefined, text: string, role: string, manifest: RecordingIndex = index): { src: string; start: number } | null {
  if (!speechId) return null;
  const clip = manifest.clips[speechId];
  if (!clip || clip.role !== role) return null;
  if (normalized(clip.text) === normalized(text)) return { src: clip.src, start: 0 };
  if (clip.cue.start >= 0 && Number.isFinite(clip.cue.start) && normalized(clip.cue.text) === normalized(text)) return { src: clip.src, start: clip.cue.start };
  // Script changes must not play a recording of different words.
  return null;
}
export const hasRecordings = () => Object.keys(index.clips).length > 0;
let cancelCurrent: (() => void) | undefined;
export function stopRecordedAudio() { cancelCurrent?.(); }
/** True means played or deliberately cancelled; false permits device-voice fallback. */
export function playRecording(src: string, start: number, rate: number): Promise<boolean> {
  stopRecordedAudio();
  return new Promise(resolve => {
    const audio = new Audio(new URL(src, new URL(import.meta.env.BASE_URL, window.location.href)).href);
    audio.playbackRate = rate;
    audio.preload = 'auto';
    let settled = false;
    let guard = setTimeout(() => done(false), 15_000);
    const done = (ok: boolean) => {
      if (settled) return; settled = true; clearTimeout(guard);
      audio.onloadedmetadata = null; audio.onended = null; audio.onerror = null;
      audio.pause(); audio.removeAttribute('src'); audio.load();
      if (cancelCurrent === cancel) cancelCurrent = undefined;
      resolve(ok);
    };
    const cancel = () => done(true);
    cancelCurrent = cancel;
    audio.onerror = () => done(false);
    audio.onended = () => done(true);
    audio.onloadedmetadata = () => {
      if (settled) return;
      if (!Number.isFinite(audio.duration) || start >= audio.duration) { done(false); return; }
      audio.currentTime = Math.max(0, start);
      clearTimeout(guard);
      guard = setTimeout(() => done(false), ((audio.duration - start) / rate + 15) * 1000);
      void audio.play().catch(() => done(false));
    };
    audio.load();
  });
}
