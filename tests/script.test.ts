import { describe, expect, it } from 'vitest';
import { parseScript } from '../scripts/parse-script.mjs';
import { chunkLines, cueFor, spokenLines, tokens, type Scene } from '../src/lib/script';
import { applyOutcome, streak, dayKey } from '../src/lib/progress';
import { alignHeard, checkPortion, heardWords, outcomeFor } from '../src/check';

const config = {
  roles: [
    { name: 'Romeo', labels: ['ROMEO'], house: 'montague' },
    { name: 'Nurse', labels: ['NURSE'], house: 'capulet' },
    { name: 'Lord Capulet', labels: ['CAPULET'], house: 'capulet' },
    { name: 'Servant #1', labels: ['SERVANT #1'], house: 'capulet' },
  ],
  overrides: [{ scene: '1.1', label: 'SERVANT', role: 'Servant #1' }],
  scene_titles: { '1.1': 'Test Scene' },
};
const text = `TITLE: Test Play
CREDIT: Someone

=== ACT 1, SCENE 1 ===
[Enter ROMEO.]

ROMEO [aside]:
Shall I hear more, or shall I speak at this?
> She has just said she loves you.
= Should I keep listening?

NURSE [offstage]:
Madam.

CAPULET:
Come go with me.
[to Peter] Go, sirrah, trudge about
[They kiss.]
Through fair Verona.
[Exeunt LORD CAPULET and PARIS.]

SERVANT:
Anon.
`;

describe('parseScript', () => {
  const { script, report } = parseScript(text, config);
  const scene = script.scenes[0];
  const speeches = scene.items.filter((i: any) => i.k === 's');

  it('reads headings, titles and roles', () => {
    expect(script.title).toBe('Test Play');
    expect(scene).toMatchObject({ id: '1.1', act: 1, scene: 1, title: 'Test Scene' });
    expect(report.problems).toEqual([]);
  });
  it('handles notes on speaker labels', () => {
    expect(speeches[0]).toMatchObject({ role: 'romeo', note: 'aside', plain: 'Should I keep listening?', why: 'She has just said she loves you.' });
    expect(speeches[1]).toMatchObject({ role: 'nurse', note: 'offstage' });
  });
  it('keeps inline directions in the speech and hoists trailing ones', () => {
    expect(speeches[2].lines).toEqual(['Come go with me.', '[to Peter] Go, sirrah, trudge about', '[They kiss.]', 'Through fair Verona.']);
    expect(scene.items[scene.items.indexOf(speeches[2]) + 1]).toEqual({ k: 'd', text: 'Exeunt LORD CAPULET and PARIS.' });
  });
  it('attaches scene summaries and wants, and flags wants for characters not in the scene', () => {
    const scenes = { '1.1': { summary: 'A test.', wants: { Romeo: 'To listen.' } } };
    const ok = parseScript(text, { ...config, scenes });
    expect(ok.script.scenes[0]).toMatchObject({ summary: 'A test.', wants: { romeo: 'To listen.' } });
    expect(ok.report.missingWants).toBe(3);
    const bad = parseScript(text, { ...config, scenes: { '1.1': { wants: { Juliet: 'x' } }, '9.9': {} } });
    expect(bad.report.problems.join(' ')).toMatch(/Juliet.*not a role/);
    expect(bad.report.problems.join(' ')).toContain('no scene "9.9"');
  });
  it('applies per-scene role overrides', () => {
    expect(speeches[3].role).toBe('servant-1');
  });
  it('reports unknown speakers', () => {
    const bad = parseScript(text.replace('NURSE [offstage]:', 'GHOST:'), config);
    expect(bad.report.problems.join(' ')).toContain('GHOST');
  });
  it('gives identical speeches different ids, stable across runs', () => {
    const twice = parseScript(text + '\nSERVANT:\nAnon.\n', config).script.scenes[0].items.filter((i: any) => i.k === 's');
    expect(twice[3].id).toBe(speeches[3].id);
    expect(twice[4].id).toBe(speeches[3].id + '-2');
  });
});

describe('script helpers', () => {
  it('strips stage directions from spoken text', () => {
    expect(spokenLines(['[to Peter] Go, sirrah', '[They kiss.]', 'I die. [He dies.]'])).toEqual(['Go, sirrah', 'I die.']);
  });
  it('splits words from punctuation', () => {
    expect(tokens('’Tis “marry,” sir—')).toEqual([
      { lead: '’', core: 'Tis', trail: '' },
      { lead: '“', core: 'marry', trail: ',”' },
      { lead: '', core: 'sir', trail: '—' },
    ]);
  });
  it('chunks long speeches and avoids a lonely last line', () => {
    const lines = Array.from({ length: 9 }, (_, i) => `Line number ${i + 1} here.`);
    const chunks = chunkLines(lines);
    expect(chunks.map((c) => c.length)).toEqual([4, 5]);
    expect(chunks.flat()).toEqual(lines);
  });
  it('splits long prose into sentences', () => {
    const prose = 'One two three four five six seven eight nine ten. Eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty. Twenty-one twenty-two twenty-three twenty-four.';
    expect(chunkLines([prose]).flat().length).toBeGreaterThan(1);
  });
  it('finds the cue: nearest earlier speech by someone else', () => {
    const scene: Scene = { id: '1.1', act: 1, scene: 1, title: '', items: [
      { k: 'd', text: 'Enter ALL.' },
      { k: 's', id: 'a', role: 'nurse', lines: ['One.', 'Two.', 'Three.'] },
      { k: 's', id: 'b', role: 'romeo', lines: ['Mine.'] },
      { k: 's', id: 'c', role: 'romeo', lines: ['Mine again.'] },
    ] };
    expect(cueFor(scene, 0 + 1)).toEqual({ who: 'Stage', text: 'Enter ALL.' });
    expect(cueFor(scene, 3)).toMatchObject({ text: 'Two. Three.' });
  });
});

describe('progress rules', () => {
  it('raises mastery on success, up to the game cap', () => {
    let s = applyOutcome(undefined, 'good', 2, 100);
    expect(s.l).toBe(1);
    s = applyOutcome(s, 'good', 2, 100);
    s = applyOutcome(s, 'good', 2, 100);
    expect(s.l).toBe(2);
    expect(s.due).toBe(101);
  });
  it('drops a level and comes back today on a miss', () => {
    const s = applyOutcome({ l: 3, due: 110, miss: 0, seen: 4, last: 'good' }, 'miss', 5, 100);
    expect(s).toMatchObject({ l: 2, due: 100, miss: 1, last: 'miss' });
  });
  it('counts a streak that survives until the end of today', () => {
    const days = { [dayKey(98)]: 1, [dayKey(99)]: 2 };
    expect(streak(days, 100)).toBe(2);
    expect(streak({ ...days, [dayKey(100)]: 1 }, 100)).toBe(3);
    expect(streak(days, 101)).toBe(0);
  });
});

describe('line check', () => {
  it('marks which words were heard, in order, allowing near misses', () => {
    const want = ['but', 'soft', 'what', 'light', 'through', 'yonder', 'window', 'breaks'];
    expect(heardWords(want, ['but', 'soft', 'what', 'light', 'yonder', 'windows', 'breaks'])).toEqual([true, true, true, true, false, true, true, true]);
    expect(heardWords(want, [])).toEqual(want.map(() => false));
  });
  it('reports the word heard in place of a missed one, only for one-for-one swaps', () => {
    const r = alignHeard(['deny', 'thy', 'father', 'and', 'refuse', 'thy', 'name'], ['deny', 'the', 'father', 'and', 'name']);
    expect(r.hit).toEqual([true, false, true, true, false, false, true]);
    expect(r.said).toEqual([null, 'the', null, null, null, null, null]);
  });
  it('turns misses into an outcome', () => {
    expect(outcomeFor(0, 10)).toBe('good');
    expect(outcomeFor(0, 10, 3)).toBe('ok');
    expect(outcomeFor(1, 10)).toBe('ok');
    expect(outcomeFor(3, 10)).toBe('miss');
  });
  it('checks only the opening of a long speech', () => {
    const short = ['One two three.', 'Four five six.'];
    expect(checkPortion(short)).toEqual({ lines: short, partial: false });
    const long = Array.from({ length: 12 }, (_, i) => `This is verse line number ${i + 1} of many.`);
    const p = checkPortion(long);
    expect(p.partial).toBe(true);
    expect(p.lines.length).toBeLessThan(long.length);
    expect(p.lines[0]).toBe(long[0]);
  });
});
