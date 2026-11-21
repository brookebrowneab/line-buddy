import { describe, it, expect, vi } from 'vitest';
import { startBrowserRecognition } from '../src/lib/browser-recognition';
function setup() {
  const rec: any = { start: vi.fn(), stop: vi.fn(), abort: vi.fn() };
  const callbacks = { ready: vi.fn(), complete: vi.fn(), error: vi.fn() };
  const session = startBrowserRecognition(rec, 'en-US', callbacks);
  return { rec, callbacks, session };
}
describe('browser recording restart', () => {
  it('does not show Done before the recognition engine actually starts', () => {
    const { rec, callbacks } = setup();
    expect(callbacks.ready).not.toHaveBeenCalled();
    rec.onstart();
    expect(callbacks.ready).toHaveBeenCalledTimes(1);
  });
  it('reports network failures, never treats failed startup as a completed take', () => {
    const { rec, callbacks } = setup();
    rec.onerror({ error: 'network' }); rec.onend(); rec.onend();
    expect(callbacks.error).toHaveBeenCalledWith(expect.stringContaining('network error'));
    expect(callbacks.complete).not.toHaveBeenCalled();
  });
  it('ignores cancelled-session events after restarting and clears the old transcript', () => {
    const first = setup();
    first.rec.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'old take' }], { isFinal: true })] });
    first.session.cancel();
    const second = setup();
    first.rec.onend(); first.rec.onerror({error:'network'});
    expect(first.callbacks.complete).not.toHaveBeenCalled(); expect(first.callbacks.error).not.toHaveBeenCalled();
    expect(second.callbacks.ready).not.toHaveBeenCalled();
    second.rec.onstart();
    second.rec.onresult({resultIndex:0,results:[Object.assign([{transcript:'Queen Mab hath been with you'}],{isFinal:true})]});
    second.session.stop(); second.rec.onend();
    expect(second.callbacks.complete).toHaveBeenCalledTimes(1);
    expect(second.callbacks.complete).toHaveBeenCalledWith('Queen Mab hath been with you');
  });
});
