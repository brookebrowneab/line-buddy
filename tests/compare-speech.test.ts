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
});
