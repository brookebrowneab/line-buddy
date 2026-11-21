import {describe,it,expect} from 'vitest';
import {compareSpeech} from '../src/lib/speech-match';
describe('spoken rehearsal feedback',()=>{
 it('accepts archaic contractions and minor phonetic spelling differences',()=>{
  const result=compareSpeech("’Tis Romeo o’er the alderman",'It is Romio over the aldereman');
  expect(result.accuracy).toBe(1);expect(result.hit).toEqual([true,true,true,true,true]);
  expect(result.wordMatches.map(word=>word.word)).toEqual(['’Tis','Romeo','o’er','the','alderman']);
 });
 it('accepts a corrected false start without treating a genuine substitution as correct',()=>{
  expect(compareSpeech('On courtiers knees','On courtiers knee knees').accuracy).toBe(1);
  expect(compareSpeech('I love thee','I hate thee').hit).toEqual([true,false,true]);
  expect(compareSpeech('hath been with you','hate been with you').hit).toEqual([false,true,true,true]);
 });
 it('rejects real words that sound similar but have different meanings',()=>{
  expect(compareSpeech('these words','those words').hit).toEqual([false,true]);
  expect(compareSpeech('living soul','loving soul').hit).toEqual([false,true]);
 });
 it('counts a missing repeated script word and produces zero for no spoken words',()=>{
  expect(compareSpeech('Romeo Romeo wherefore art thou Romeo','Romeo wherefore art thou Romeo').accuracy).toBeCloseTo(5/6);
  expect(compareSpeech('Queen Mab hath been with you','').accuracy).toBe(0);
  expect(compareSpeech('','').accuracy).toBe(0);
 });
 it('accepts o or oh for printed o’er without conflating ordinary over or missing words',()=>{
  for(const printed of ["O’er","O'er",'oer']) for(const heard of ['o','oh','or','over']) {
   expect(compareSpeech(`${printed} ladies’ lips`,`${heard} ladies lips`).accuracy).toBe(1);
  }
  expect(compareSpeech('over the wall','o the wall').hit).toEqual([false,true,true]);
  expect(compareSpeech('O’er ladies lips','ladies lips').hit).toEqual([false,true,true]);
 });
 it('accepts our and are as speech homophones in either direction',()=>{
  expect(compareSpeech('Our revels now are ended','Are revels now our ended').accuracy).toBe(1);
  expect(compareSpeech('Our revels now are ended','revels now ended').hit).toEqual([false,true,true,false,true]);
 });
 it('accepts straight and curly apostrophes and modern curtsies spelling',()=>{
  for(const heard of ["cur'sies",'cur’sies','curtsies']) expect(compareSpeech('dream on cur’sies straight',`dream on ${heard} straight`).accuracy).toBe(1);
 });

 it('accepts May as a recognition error for printed Nay without reversing the rule',()=>{
  expect(compareSpeech('Nay, gentle Romeo','May gentle Romeo').accuracy).toBe(1);
  expect(compareSpeech('May I go','Nay I go').hit).toEqual([false,true,true]);
  expect(compareSpeech('Nay gentle Romeo','gentle Romeo').hit).toEqual([false,true,true]);
 });

});
