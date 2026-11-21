/** Equivalent printed/spoken spellings, not substitutions for different words. */
const equivalents: Record<string, string> = {
  o: 'oh', oer: 'over', eer: 'ever', neer: 'never', een: 'even',
  tis: 'itis', twas: 'itwas', twere: 'itwere', twould: 'itwould',
  gainst: 'against', taen: 'taken', th: 'the', curtsies: 'cursies', curtsys: 'cursies', curtsy: 'curtsy',
  goodby: 'goodbye', goodnight: 'goodnight',
};
export const normalizeSpeechWord = (word: string) => {
  const plain = word.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');
  return equivalents[plain] || plain;
};
const joinedSpellings = new Set(['itis', 'itwas', 'itwere', 'itwould', 'sweetmeats', 'goodnight', 'goodbye', 'oclock', 'tonight', 'tomorrow', 'forever', 'farewell']);
function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = tmp;
    }
  }
  return row[b.length];
}
/** Conservative Soundex plus spelling distance: phonetics alone accepts too much. */
export function soundex(word: string): string {
  const text=normalizeSpeechWord(word);if(!text)return '';
  const groups:Record<string,string>={b:'1',f:'1',p:'1',v:'1',c:'2',g:'2',j:'2',k:'2',q:'2',s:'2',x:'2',z:'2',d:'3',t:'3',l:'4',m:'5',n:'5',r:'6'};
  let result=text[0],previous=groups[text[0]]||'';
  for(const c of text.slice(1)){const code=groups[c]||'';if(code&&code!==previous)result+=code;previous=code;}
  return result.padEnd(4,'0').slice(0,4);
}
const close = (want: string, heard: string) => want === heard ||
  (Math.min(want.length,heard.length)>=5 && soundex(want.replace(/s$/,''))===soundex(heard.replace(/s$/,'')) &&
   editDistance(want,heard)<= (Math.max(want.length,heard.length)>=8?2:1) &&
   1-editDistance(want,heard)/Math.max(want.length,heard.length)>=.75);
export function normalizeSpeechText(text:string):string {
 return text.toLowerCase().replace(/[’‘]/g,"'")
  .replace(/\b'?tis\b/g,'it is').replace(/\b'?twas\b/g,'it was').replace(/\b'?twere\b/g,'it were')
  .replace(/\bo'er\b/g,'over').replace(/\bne'er\b/g,'never').replace(/\be'er\b/g,'ever')
  .replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ').trim();
}


/** Align in order. Extra attempts, repeated phrases and false starts are unscored.
 * A corrected word still has to occur later in the right order. Recognized
 * two-word spellings match a compound/elision without marking a word missing.
 */
export function alignHeard(want: string[], heard: string[]): { hit: boolean[]; said: (string | null)[] } {
  const w = want.map(normalizeSpeechWord), h = heard.map(normalizeSpeechWord);
  const n = w.length, m = h.length;
  const spans = (i: number, j: number): [number, number][] => {
    const options: [number, number][] = [];
    if (!w[i] || !h[j]) return options;
    // ASR commonly writes the homophone 'or' for printed o'er. Limit this
    // tolerance to that elision; ordinary 'or' and 'over' remain distinct.
    const elidedOver = want[i].toLowerCase().replace(/[^a-z]/g, '') === 'oer' && h[j] === 'or';
    if (close(w[i], h[j]) || elidedOver) options.push([1, 1]);
    if (j + 1 < m && joinedSpellings.has(w[i]) && w[i] === h[j] + h[j + 1]) options.push([1, 2]);
    if (i + 1 < n && joinedSpellings.has(h[j]) && w[i] + w[i + 1] === h[j]) options.push([2, 1]);
    return options;
  };
  const t = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    t[i][j] = Math.max(t[i + 1][j], t[i][j + 1], ...spans(i, j).map(([a, b]) => a + t[i + a][j + b]));
  }
  const hit = new Array<boolean>(n).fill(false), said = new Array<string | null>(n).fill(null);
  // Boundaries store the next positions after each matched span.
  const matches: { wi: number; hj: number; a: number; b: number }[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    const match = spans(i, j).find(([a, b]) => t[i][j] === a + t[i + a][j + b]);
    if (match) {
      const [a, b] = match; matches.push({ wi: i, hj: j, a, b });
      for (let k = 0; k < a; k++) hit[i + k] = true;
      i += a; j += b;
    } else if (t[i + 1][j] >= t[i][j + 1]) i++;
    else j++;
  }
  let wi = 0, hj = 0;
  for (const match of [...matches, { wi: n, hj: m, a: 0, b: 0 }]) {
    const missing = match.wi - wi;
    if (missing > 0 && missing === match.hj - hj) for (let k = 0; k < missing; k++) said[wi + k] = heard[hj + k];
    wi = match.wi + match.a; hj = match.hj + match.b;
  }
  return { hit, said };
}
export const heardWords = (want: string[], heard: string[]) => alignHeard(want, heard).hit;

export function compareSpeech(targetLine:string,transcript:string) {
 const targetWords=targetLine.split(/\s+/).filter(word=>normalizeSpeechWord(word));
 const result=alignHeard(targetWords,transcript.split(/\s+/).filter(word=>normalizeSpeechWord(word)));
 const matched=result.hit.filter(Boolean).length;
 return {...result,wordMatches:targetWords.map((word,index)=>({word,matched:result.hit[index],heard:result.said[index]})),accuracy:targetWords.length?matched/targetWords.length:0};
}
