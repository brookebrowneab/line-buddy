export const WHISPER_MODEL = 'onnx-community/whisper-base.en';
export const WHISPER_REVISION = '51eefc0af78b103839eda9e7e4f4186acc6517fe';
export const SAMPLE_RATE = 16000;
export const SHAKESPEARE_VOCABULARY = [
 'Romeo','Juliet','Mercutio','Benvolio','Tybalt','Capulet','Montague','Friar Lawrence',
 'Queen Mab','Rosaline','Verona','prithee','wherefore','thou','thee','thy','thine',
 'hath','doth','dost','art','ere','anon','beseech','alderman','atomies','courtiers',
 'cur’sies','sweetmeats',"’tis","’twas","o’er","ne’er",
];
/** Keep script context short: a full future speech made Whisper skip spoken words
 * in the real Queen Mab acceptance test. Vocabulary gets its own budget. */
export function promptTokens(encode: (text:string)=>number[], targetLine: string, previous: string[] = []) {
  const current=[...previous,targetLine].join(' ').toLowerCase();
  const vocabulary=[...SHAKESPEARE_VOCABULARY.filter(word=>current.includes(word.toLowerCase())),...SHAKESPEARE_VOCABULARY];
  const glossary=[...new Set(vocabulary)].join(', ');
  // Whisper interprets a verbatim future line as already-spoken history and may
  // omit it. Supply the line and prior context as vocabulary lists instead.
  const vocabularyFrom=(text:string)=>[...new Set((text.match(/[\p{L}’']+/gu)||[]).filter(word=>word.length>=4))].sort((a,b)=>a.localeCompare(b)).join(', ');
  return [
    ...encode('Shakespeare vocabulary: '+glossary+'.').slice(0,55),
    ...encode(' Prior vocabulary: '+vocabularyFrom(previous.join(' '))).slice(0,32),
    ...encode(' Line vocabulary: '+vocabularyFrom(targetLine)).slice(0,64),
  ].slice(-223);
}
export function decoderPrompt(encode:(text:string)=>number[], targetLine:string, previous:string[] = []) {
  const special=(token:string)=>{const ids=encode(token);if(ids.length!==1)throw new Error('Unsupported Whisper tokenizer.');return ids[0];};
  // Transformers.js 3.8 does not implement prompt_ids. This is Whisper's actual
  // startofprev/context/startoftranscript prefix, removed from decoded output.
  return [special('<|startofprev|>'),...promptTokens(encode,targetLine,previous),special('<|startoftranscript|>'),special('<|notimestamps|>')];
}
export function hasSpeechEnergy(audio: Float32Array) {
  let energy=0;for(const sample of audio){if(!Number.isFinite(sample))throw new Error('Invalid audio samples.');energy+=sample*sample;}
  return audio.length>0 && Math.sqrt(energy/audio.length)>.001;
}
/** Deduplicate only an overlapping chunk boundary, never repeats inside a take. */
export function mergeChunks(left:string,right:string) {
 const a=left.trim().split(/\s+/).filter(Boolean),b=right.trim().split(/\s+/).filter(Boolean);
 const norm=(x:string)=>x.toLowerCase().replace(/[^a-z0-9]/g,'');
 for(let n=Math.min(20,a.length,b.length);n>=2;n--)if(a.slice(-n).every((w,i)=>norm(w)===norm(b[i])))return [...a,...b.slice(n)].join(' ');
 return [...a,...b].join(' ');
}
