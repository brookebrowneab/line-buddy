import { afterEach, describe, expect, it, vi } from 'vitest';
import { transcribeRecording, recordSpeech } from '../src/lib/transcription';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('ElevenLabs client', () => {
  it('uploads audio to the app server without an API key or expected text', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: 'Wherefore art thou Romeo?', model: 'scribe_v3' }) });
    vi.stubGlobal('fetch', request);
    const result = await transcribeRecording(new Blob(['audio'], { type: 'audio/webm' }), new AbortController().signal);
    expect(result.text).toBe('Wherefore art thou Romeo?');
    expect(request.mock.calls[0][0]).toBe('/api/transcription');
    const init = request.mock.calls[0][1];
    expect([...init.body.keys()]).toEqual(['audio']); expect(init.headers).toBeUndefined();
  });
  it('explains missing servers and provider failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => { throw new Error(); } }));
    await expect(transcribeRecording(new Blob(), new AbortController().signal)).rejects.toThrow('server is unavailable');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Usage limit reached' }) }));
    await expect(transcribeRecording(new Blob(), new AbortController().signal)).rejects.toThrow('Usage limit reached');
  });
  it('releases the microphone and never uploads a cancelled take', async () => {
    vi.useFakeTimers();
    const stopTrack = vi.fn(); let instance: any;
    class Recorder {
      static isTypeSupported() { return true; }
      state = 'inactive'; mimeType = 'audio/webm'; onstop?: () => void;
      constructor() { instance = this; }
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; this.onstop?.(); }
    }
    vi.stubGlobal('MediaRecorder', Recorder);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: stopTrack }] }) } });
    const complete = vi.fn();
    const recording = await recordSpeech(complete, vi.fn());
    recording.cancel();
    expect(instance.state).toBe('inactive'); expect(stopTrack).toHaveBeenCalled(); expect(complete).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('allows a whole-speech recording beyond 90 seconds and stops at five minutes', async () => {
    vi.useFakeTimers();
    const stopTrack = vi.fn(); let instance: any;
    class Recorder {
      static isTypeSupported() { return true; }
      state = 'inactive'; mimeType = 'audio/webm'; onstop?: () => void;
      constructor() { instance = this; }
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; this.onstop?.(); }
    }
    vi.stubGlobal('MediaRecorder', Recorder);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: stopTrack }] }) } });
    const complete = vi.fn();
    await recordSpeech(complete, vi.fn(), 300);
    vi.advanceTimersByTime(90_000);
    expect(instance.state).toBe('recording'); expect(complete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(210_000);
    expect(instance.state).toBe('inactive'); expect(complete).toHaveBeenCalledTimes(1);
    expect(stopTrack).toHaveBeenCalled();
  });

});
