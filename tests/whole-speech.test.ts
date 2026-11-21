import { describe, expect, it } from 'vitest';
import { buildSteps } from '../src/lib/games';
import { getState } from '../src/lib/progress';
import { items, partIds, script, speechItems } from '../src/lib/script';
const role = script.roles.find(r => r.name === 'Mercutio')!.id;
const speeches = speechItems(role, '1.4');
const mab = speeches.find(s => s.lines.join(' ').includes('Queen Mab'))!;
describe('whole speech practice', () => {
  it('offers the entire Queen Mab turn as one question in all four word games', () => {
    for (const game of ['sayit', 'letters', 'vanish', 'scramble'] as const) {
      const steps = buildSteps(getState(), game, role, '1.4', 'whole');
      const step = steps.find(s => s.item.speechId === mab.speechId)!;
      expect(step.item.lines).toEqual(mab.lines);
      expect(step.item.lines.join(' ')).toContain('This is she');
      expect(step.item.lines.join(' ').split(/\s+/).length).toBeGreaterThan(100);
      expect(step.ids).toEqual(partIds(mab));
      expect(step.ids.length).toBeGreaterThan(1);
      expect(step.wholeSpeech).toBe(true);
      expect(steps).toHaveLength(speeches.length);
    }
  });
  it('keeps short parts with their original cue and progress IDs', () => {
    const short = buildSteps(getState(), 'sayit', role, '1.4', 'parts');
    expect(short.map(s => s.item)).toEqual(items(role, '1.4'));
    expect(short.every(s => s.ids.length === 1 && s.ids[0] === s.item.id)).toBe(true);
    const mabParts = short.filter(s => s.item.speechId === mab.speechId);
    expect(mabParts.map(s => s.ids[0])).toEqual(partIds(mab));
    expect(mabParts[1].item.cue?.self).toBe(true);
  });
  it('retains the partner cue for whole speeches instead of a preceding part', () => {
    const full = buildSteps(getState(), 'sayit', role, '1.4', 'whole').find(s => s.item.id === mab.id)!;
    expect(full.item.cue).toEqual(mab.cue);
    expect(full.item.cue?.self).not.toBe(true);
    expect(full.item.parts).toBe(1);
  });
});
