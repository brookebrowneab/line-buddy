import { describe, it, expect } from 'vitest';
import { alignHeard, heardWords } from '../src/lib/speech-match';
const words = (text: string) => text.split(/\s+/);
const allHeard = (want: string, heard: string) => heardWords(words(want), words(heard));
describe('Shakespeare rehearsal transcription', () => {
  it('accepts Oh for the printed interjection O', () => {
    expect(allHeard('O, then I see Queen Mab', 'Oh then I see Queen Mab')).toEqual([true,true,true,true,true,true]);
    expect(allHeard('O, then I see', 'then I see')).toEqual([false,true,true,true]);
  });
  it('accepts transcribed or for the elision o’er without making or and over interchangeable', () => {
    for (const spelling of ["O’er", "O'er", 'oer']) {
      expect(allHeard(`${spelling} lawyers’ fingers`, 'or lawyers fingers')).toEqual([true,true,true]);
    }
    expect(allHeard('O’er ladies’ lips', 'over ladies lips')).toEqual([true,true,true]);
    expect(allHeard('or else', 'over else')).toEqual([false,true]);
    expect(allHeard('O’er ladies’ lips', 'ladies lips')).toEqual([false,true,true]);
  });
  it('accepts the Queen Mab self-correction and alternate spelling', () => {
    const want = "On courtiers’ knees, that dream on cur’sies straight; O’er lawyers’ fingers, who straight dream on fees; O’er ladies’ lips, who straight on kisses dream, Which oft the angry Mab with blisters plagues Because their breaths with sweetmeats tainted are.";
    const heard = "On courtiers' knee- knees that dream on curtsies straight, over lawyers' fingers, who straight dream on fees, over ladies' lips, who straight on kisses dream. Which oft the angry Mab with blisters plagues, because their breaths with sweet meats tainted are.";
    expect(allHeard(want, heard)).toEqual(words(want).map(() => true));
  });
  it('accepts a wrong word followed by its correction and repeated phrase', () => {
    expect(allHeard('She is the fairies midwife', 'She is the fairies nurse no midwife')).toEqual([true,true,true,true,true]);
    expect(allHeard('Queen Mab hath been with you', 'Queen Mab Queen Mab hath been hath been with you')).toEqual([true,true,true,true,true,true]);
  });
  it('matches elisions and compounds in either direction', () => {
    for (const [a,b] of [["’Tis goodnight",'It is good night'],["Ne’er o’er e’er",'never over ever'],['sweetmeats','sweet meats'],['sweet meats','sweetmeats'],['It is good night',"’Tis goodnight"]]) {
      expect(allHeard(a,b)).toEqual(words(a).map(() => true));
    }
  });
  it('still flags omitted or genuinely different words', () => {
    expect(allHeard('Deny thy father and refuse thy name', 'Deny thy father and thy name')).toEqual([true,true,true,true,false,true,true]);
    expect(allHeard('I love thee', 'I hate thee')).toEqual([true,false,true]);
    expect(allHeard('hath been with you','them with you')).toEqual([false,false,true,true]);
  });
  it('does not merge arbitrary words or hide missing repeated script words', () => {
    expect(allHeard('a part','apart')[0]).toBe(false);
    expect(allHeard('Romeo Romeo wherefore art thou Romeo','Romeo wherefore art thou Romeo').filter(Boolean)).toHaveLength(5);
    expect(alignHeard(['sweetmeats','tainted','are'],['sweet','meats','rotten','are'])).toEqual({hit:[true,false,true],said:[null,'rotten',null]});
  });
});
