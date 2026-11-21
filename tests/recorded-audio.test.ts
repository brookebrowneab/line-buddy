import { afterEach, describe, expect, it, vi } from 'vitest';
import { findRecording, playRecording, stopRecordedAudio, type RecordingIndex } from '../src/lib/recorded-audio';
const manifest: RecordingIndex = { version: 1, model: 'eleven_v3', clips: { speech1: {
  role: 'romeo', text: 'But soft. What light through yonder window breaks?', src: 'audio/speeches/romeo.mp3', fingerprint: 'test', cue: { text: 'What light through yonder window breaks?', start: 2.1 },
} } };
afterEach(() => { stopRecordedAudio(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });
describe('recorded character playback', () => {
  it('matches full speech and cue by stable speech ID, text and role', () => {
    expect(findRecording('speech1', manifest.clips.speech1.text, 'romeo', manifest)).toEqual({ src: 'audio/speeches/romeo.mp3', start: 0 });
    expect(findRecording('speech1', manifest.clips.speech1.cue.text, 'romeo', manifest)?.start).toBe(2.1);
    expect(findRecording('speech1', 'Changed words', 'romeo', manifest)).toBeNull();
    expect(findRecording('speech1', manifest.clips.speech1.text, 'juliet', manifest)).toBeNull();
    expect(findRecording('missing', 'But soft.', 'romeo', manifest)).toBeNull();
  });
  it('refuses an excerpt without valid timing instead of playing the wrong words', () => {
    const copy = structuredClone(manifest); copy.clips.speech1.cue.start = -1;
    expect(findRecording('speech1', copy.clips.speech1.cue.text, 'romeo', copy)).toBeNull();
  });
  function fakeAudio() {
    vi.useFakeTimers(); vi.stubEnv('BASE_URL', './'); let instance: any;
    class FakeAudio {
      duration = 10; currentTime = 0; playbackRate = 1; preload = '';
      onloadedmetadata: (() => void) | null = null; onended: (() => void) | null = null; onerror: (() => void) | null = null;
      play = vi.fn().mockResolvedValue(undefined); pause = vi.fn(); load = vi.fn(); removeAttribute = vi.fn();
      constructor(public src: string) { instance = this; }
    }
    vi.stubGlobal('Audio', FakeAudio); vi.stubGlobal('window', { location: { href: 'https://example.test/lines/#/scene/1.4' } });
    return () => instance;
  }
  it('uses the deployment subpath, cue offset and selected playback rate', async () => {
    const get = fakeAudio(); const promise = playRecording('audio/speeches/romeo.mp3', 2.1, 0.8);
    const audio = get(); expect(audio.src).toContain('/lines/audio/speeches/romeo.mp3');
    audio.onloadedmetadata(); expect(audio.currentTime).toBe(2.1); expect(audio.playbackRate).toBe(0.8);
    audio.onended(); expect(await promise).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });
  it('settles cancellation without triggering fallback, and permits fallback on missing files', async () => {
    const get = fakeAudio(); const cancelled = playRecording('audio/one.mp3', 0, 1);
    stopRecordedAudio(); expect(await cancelled).toBe(true); expect(get().pause).toHaveBeenCalled();
    const failed = playRecording('audio/missing.mp3', 0, 1); get().onerror(); expect(await failed).toBe(false);
  });
});
