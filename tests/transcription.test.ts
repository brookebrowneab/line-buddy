import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localBrowser } from './support/local-browser';
let browser: ReturnType<typeof localBrowser>;
let transcribeRecording: typeof import('../src/lib/transcription').transcribeRecording;
let recordSpeech: typeof import('../src/lib/transcription').recordSpeech;
beforeEach(async () => { vi.resetModules(); browser = localBrowser(); ({ transcribeRecording, recordSpeech } = await import('../src/lib/transcription')); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('on-device transcription', () => {
  it('returns matching results and sends 16kHz mono PCM and context only to a local worker', async () => {
    const result = await transcribeRecording(new Blob(['audio']),new AbortController().signal,'Wherefore art thou Romeo?',['O Romeo']);
    expect(result.text).toBe('Wherefore art thou Romeo?');
    expect(result.accuracy).toBe(1); expect(result.hit).toEqual([true,true,true,true]);
    expect(result.wordMatches).toHaveLength(4);
    expect(browser.contexts).toEqual([[1,1,16000],[1,16000,16000]]);
    expect(browser.jobs.at(-1)).toMatchObject({type:'transcribe',audio:browser.pcm,targetLine:'Wherefore art thou Romeo?',previousContextLines:['O Romeo']});
    expect(browser.network).not.toHaveBeenCalled();
  });
  it('does not decode or start inference for an already cancelled take', async () => {
    const controller=new AbortController(); controller.abort();
    await expect(transcribeRecording(new Blob(),controller.signal,'Hello')).rejects.toThrow(/cancelled/);
    expect(browser.contexts).toHaveLength(0); expect(browser.jobs).toHaveLength(0);
  });
  it('cancels a pending model download and can retry without uploading the abandoned take', async () => {
    browser.hold();
    const controller = new AbortController();
    const attempt = transcribeRecording(new Blob(['audio']),controller.signal,'Hello');
    const rejected = expect(attempt).rejects.toThrow(/cancelled/);
    await vi.waitFor(() => expect(browser.workers).toHaveLength(1));
    controller.abort(); await rejected;
    expect(browser.workers[0].terminated).toBe(true);
    const retry = transcribeRecording(new Blob(['audio']),new AbortController().signal,'Hello');
    await vi.waitFor(() => expect(browser.workers).toHaveLength(2));
    browser.workers[1].reply();
    await vi.waitFor(() => expect(browser.jobs.at(-1).type).toBe('transcribe'));
    browser.workers[1].reply({text:'Hello'});
    expect((await retry).accuracy).toBe(1); expect(browser.network).not.toHaveBeenCalled();
  });
  it('rejects an overlong recording before loading a model', async () => {
    browser.setDuration(301);
    await expect(transcribeRecording(new Blob(['audio']),new AbortController().signal,'Hello')).rejects.toThrow(/five minutes/);
    expect(browser.workers).toHaveLength(0);
  });
  it('reports a runtime failure, releases the worker and allows a fresh attempt', async () => {
    browser.hold();
    const attempt=transcribeRecording(new Blob(['audio']),new AbortController().signal,'Hello');
    const rejected=expect(attempt).rejects.toThrow(/typing/);
    await vi.waitFor(()=>expect(browser.workers).toHaveLength(1));
    browser.workers[0].onerror?.(); await rejected;
    expect(browser.workers[0].terminated).toBe(true);
    expect(browser.network).not.toHaveBeenCalled();
  });
  it('discards a worker that could not accept a job and retries with a fresh worker', async () => {
    browser.failPost();
    await expect(transcribeRecording(new Blob(['audio']),new AbortController().signal,'Hello')).rejects.toThrow();
    expect(browser.workers[0].terminated).toBe(true);
    browser.setTranscript('Hello');
    expect((await transcribeRecording(new Blob(['audio']),new AbortController().signal,'Hello')).accuracy).toBe(1);
    expect(browser.workers).toHaveLength(2);
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
