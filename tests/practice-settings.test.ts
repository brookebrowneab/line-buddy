import { afterEach, describe, expect, it } from 'vitest';
import { getState, importData, resetAll, setSettings } from '../src/lib/progress';
import { buildSteps, todaySteps, BATCH } from '../src/lib/games';
import { items, script } from '../src/lib/script';
afterEach(() => resetAll());
describe('app-wide listening settings', () => {
  it('loads old progress with local recognition as default, without losing mastery', () => {
    expect(importData(JSON.stringify({ v: 1, roles: ['mercutio'], active: 'mercutio', items: { example: { l: 3, due: 1, miss: 0, seen: 2, last: 'good' } }, settings: { voice: false, rate: 0.8, speechProvider: 'elevenlabs' } }))).toBe(true);
    expect(getState().settings).toEqual({ microphone: false, voice: false, rate: 0.8, speechProvider: 'local', showTranscripts: false });
    expect(getState().items.example.l).toBe(3);
  });
  it('persists provider and comparison preferences without changing learning records', () => {
    const before = getState();
    setSettings({ microphone: true, speechProvider: 'local', showTranscripts: true });
    expect(getState().settings.microphone).toBe(true);
    expect(getState().settings.speechProvider).toBe('local');
    expect(getState().settings.showTranscripts).toBe(true);
    expect(getState().items).toEqual(before.items);
    expect(getState().days).toEqual(before.days);
    expect(getState().games).toEqual(before.games);
    const exported = JSON.stringify(getState()); resetAll(); importData(exported);
    expect(getState().settings.speechProvider).toBe('local');
    expect(getState().settings.microphone).toBe(true);
  });
});
describe('selecting later practice questions', () => {
  it('makes every scene part reachable in manual practice while daily practice stays short', () => {
    const role = script.roles.find(r => r.name === 'Mercutio')!;
    const list = items(role.id, '1.4');
    expect(list.length).toBeGreaterThan(BATCH);
    for (const game of ['sayit', 'letters', 'scramble', 'vanish'] as const) {
      const steps = buildSteps(getState(), game, role.id, '1.4');
      expect(new Set(steps.map(step => step.item.id))).toEqual(new Set(list.map(item => item.id)));
    }
    expect(todaySteps(getState(), role.id).length).toBeLessThanOrEqual(BATCH);
    expect(getState().items).toEqual({});
    expect(getState().games).toEqual({});
  });
});
