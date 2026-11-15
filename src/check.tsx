// Checks a spoken line for the kid, so they do not have to judge themselves.
// Default: type the first letter of each word from memory. Optional: let the
// browser listen (where it can), with typing as the fallback when it mishears.
import { useEffect, useMemo, useRef, useState } from 'react';
import { tokens } from './lib/script';
import type { Outcome } from './lib/progress';

type Mark = 'ok' | 'missed';

const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, '');

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}
/** Speech recognition is rough with old words: accept near matches. */
const close = (want: string, heard: string) =>
  want === heard || (want.length >= 4 && editDistance(want, heard) <= (want.length >= 7 ? 2 : 1));

/**
 * Line up what was wanted with what was heard (longest common subsequence).
 * `hit[i]` says whether wanted word i was heard. `said[i]` is the word heard in
 * its place, when a missed word lines up one-for-one with an extra heard word.
 */
export function alignHeard(want: string[], heard: string[]): { hit: boolean[]; said: (string | null)[] } {
  const n = want.length, m = heard.length;
  const t = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    t[i][j] = close(want[i], heard[j]) ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  }
  const hit = new Array<boolean>(n).fill(false);
  const said = new Array<string | null>(n).fill(null);
  const pairs: [number, number][] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (close(want[i], heard[j]) && t[i][j] === t[i + 1][j + 1] + 1) { hit[i] = true; pairs.push([i, j]); i++; j++; }
    else if (t[i + 1][j] >= t[i][j + 1]) i++;
    else j++;
  }
  // Between matched words: if the same number of words were missed and heard, treat them as swaps.
  const bounds: [number, number][] = [[-1, -1], ...pairs, [n, m]];
  for (let k = 0; k + 1 < bounds.length; k++) {
    const [wi, hj] = bounds[k];
    const [wn, hn] = bounds[k + 1];
    const missedCount = wn - wi - 1;
    if (missedCount > 0 && missedCount === hn - hj - 1) {
      for (let d = 1; d <= missedCount; d++) said[wi + d] = heard[hj + d];
    }
  }
  return { hit, said };
}
export const heardWords = (want: string[], heard: string[]) => alignHeard(want, heard).hit;

export function outcomeFor(missed: number, total: number, strikes = 0): Outcome {
  const share = total ? missed / total : 0;
  if (missed === 0) return strikes > 2 ? 'ok' : 'good';
  return missed === 1 || share <= 0.15 ? 'ok' : 'miss';
}

/** For long speeches in scene runs, check the opening rather than every word. */
export function checkPortion(lines: string[], maxWords = 30): { lines: string[]; partial: boolean } {
  const count = (l: string) => l.split(/\s+/).filter(Boolean).length;
  if (lines.reduce((n, l) => n + count(l), 0) <= maxWords) return { lines, partial: false };
  const out: string[] = [];
  let words = 0;
  for (const l of lines) {
    if (words >= 18) break;
    if (words + count(l) > maxWords) { out.push(l.split(/\s+/).slice(0, Math.max(6, maxWords - words)).join(' ') + ' …'); break; }
    out.push(l);
    words += count(l);
  }
  return { lines: out, partial: true };
}

const Recognition = (): any => (typeof window === 'undefined' ? null : (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null);
export const canListen = () => !!Recognition();
const isChrome = () => typeof navigator !== 'undefined' && /Chrome\//.test(navigator.userAgent) && !/Edg\//.test(navigator.userAgent);
/** Shown before and during listening, so the choice is informed. */
export const listenNotice = () =>
  (isChrome()
    ? 'Using Chrome? Listening sends your voice to Google to be turned into text. That is how Chrome\u2019s speech recognition works.'
    : 'Listening may send your voice to your browser\u2019s maker to be turned into text.') + ' It can also mishear old words. Typing stays on this device.';

export function LineCheck({ lines, onDone, partial, retry = true }: { lines: string[]; onDone: (o: Outcome) => void; partial?: boolean; retry?: boolean }) {
  const rows = useMemo(() => lines.map(tokens), [lines]);
  const flat = useMemo(() => rows.flatMap((r, li) => r.map((t, ti) => ({ key: `${li}-${ti}`, t }))).filter((x) => x.t.core), [rows]);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [said, setSaid] = useState<Record<string, string>>({});
  const [strikes, setStrikes] = useState(0);
  const [tries, setTries] = useState(0); // wrong letters on the current word
  const [shake, setShake] = useState(0);
  const [mode, setMode] = useState<'type' | 'listening' | 'heard' | 'review' | 'done'>('type');
  const [attempt, setAttempt] = useState(1);
  const [note, setNote] = useState('');
  const first = useRef<Outcome | null>(null);
  const recRef = useRef<any>(null);
  const next = flat.find((x) => !marks[x.key]);
  const missed = flat.filter((x) => marks[x.key] === 'missed').length;

  // Mastery is judged on the first try. A miss earns a look at the line and a second go.
  const finish = (m: Record<string, Mark>, s: number) => {
    const missedNow = flat.filter((x) => m[x.key] === 'missed').length;
    if (attempt === 1) {
      first.current = outcomeFor(missedNow, flat.length, s);
      if (missedNow > 0 && retry) { setMode('review'); return; }
    }
    setMode('done');
    onDone(first.current ?? outcomeFor(missedNow, flat.length, s));
  };
  const tryAgain = () => { setMarks({}); setSaid({}); setStrikes(0); setTries(0); setAttempt(2); setMode('type'); };
  const mark = (key: string, value: Mark, s = strikes) => {
    const m = { ...marks, [key]: value };
    setMarks(m);
    setTries(0);
    if (flat.every((x) => m[x.key])) finish(m, s);
  };
  const type = (ch: string) => {
    if (mode !== 'type' || !next || !/^[a-z0-9]$/i.test(ch)) return;
    if (next.t.core[0].toLowerCase() === ch.toLowerCase()) return mark(next.key, 'ok');
    setShake((k) => k + 1);
    setStrikes(strikes + 1);
    // Two wrong letters on the same word: show it as missed and move on.
    if (tries >= 1) mark(next.key, 'missed', strikes + 1);
    else setTries(tries + 1);
  };
  const typeRef = useRef(type);
  typeRef.current = type;
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      typeRef.current(e.key);
    };
    window.addEventListener('keydown', on);
    return () => { window.removeEventListener('keydown', on); try { recRef.current?.abort(); } catch { /* already stopped */ } };
  }, []);

  const listen = () => {
    const R = Recognition();
    if (!R) return;
    const rec = new R();
    recRef.current = rec;
    rec.lang = navigator.language?.startsWith('en') ? navigator.language : 'en-US';
    rec.continuous = true;
    rec.interimResults = false;
    let transcript = '';
    rec.onresult = (e: any) => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) transcript += ' ' + e.results[i][0].transcript; };
    rec.onerror = (e: any) => { setNote(e.error === 'not-allowed' ? 'The microphone is blocked. Type the first letters instead.' : 'Listening did not work this time. Type the first letters instead.'); setMode('type'); };
    rec.onend = () => {
      setMode((cur) => {
        if (cur !== 'listening') return cur;
        const result = alignHeard(flat.map((x) => norm(x.t.core)), transcript.split(/\s+/).map(norm).filter(Boolean));
        setMarks(Object.fromEntries(flat.map((x, i) => [x.key, result.hit[i] ? 'ok' : 'missed'] as const)));
        setSaid(Object.fromEntries(flat.flatMap((x, i) => (result.said[i] ? [[x.key, result.said[i]!] as const] : []))));
        return 'heard';
      });
    };
    setNote('');
    setMarks({});
    setSaid({});
    setMode('listening');
    try { rec.start(); } catch { setMode('type'); }
  };
  const stopListening = () => { try { recRef.current?.stop(); } catch { /* already stopped */ } };
  const retype = () => { setMarks({}); setSaid({}); setStrikes(0); setTries(0); setMode('type'); };

  const reveal = mode === 'done' || mode === 'heard' || mode === 'review';
  const anySaid = reveal && Object.keys(said).length > 0;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {attempt === 2 && mode === 'type' && <span className="chip chip-accent" style={{ justifySelf: 'start' }}>Second try, from memory</span>}
      <div key={shake} className={`verse mine ${shake && mode === 'type' ? 'shake' : ''}`}>
        {rows.map((row, li) => (
          <div key={li}>
            {row.map((t, ti) => {
              const key = `${li}-${ti}`;
              if (!t.core) return <span key={key} className="word">{reveal ? t.lead + t.trail : ''}</span>;
              const m = marks[key];
              if (!m && !reveal) return <span key={key} className={`word gap ${next?.key === key && mode === 'type' ? 'next' : ''}`} aria-label="hidden word">▁▁▁</span>;
              return (
                <span key={key} className="word">
                  {reveal && said[key] && <><s className="heard-word" aria-label={`I heard ${said[key]}`}>{said[key]}</s>{' '}</>}
                  <span className={m === 'missed' ? 'missed-word' : m === 'ok' ? 'ok-word' : ''}>{t.lead}{t.core}{t.trail}</span>
                </span>
              );
            })}
          </div>
        ))}
      </div>
      {anySaid && <div className="muted" style={{ fontSize: 13 }}>Grey crossed-out words are what I heard. The red word is the right one.</div>}

      {mode === 'type' && (
        <>
          <input className="card" style={{ fontSize: 17, padding: '12px 14px', width: '100%', boxSizing: 'border-box', color: 'var(--ink)' }}
            placeholder="Type the first letter of each word…" value="" autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false}
            onChange={(e) => type(e.target.value.slice(-1))} aria-label="Type the first letter of each word" />
          <div className="muted" style={{ fontSize: 14 }}>
            Say the line out loud, then type the first letter of each word{partial ? ' for the start of your speech' : ''}. Two wrong tries and the word shows in red.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: canListen() ? '1fr 1fr' : '1fr', gap: 10 }}>
            <button className="btn btn-small" onClick={() => next && mark(next.key, 'missed')}>I’m stuck on this word</button>
            {canListen() && <button className="btn btn-small" onClick={listen}>🎙 Listen to me instead</button>}
          </div>
          {canListen() && <div className="muted" style={{ fontSize: 13 }}>{listenNotice()}</div>}
          {note && <div className="muted" style={{ fontSize: 14 }} role="status">{note}</div>}
        </>
      )}
      {mode === 'listening' && (
        <>
          <div className="card-soft" style={{ textAlign: 'center' }}>● Listening… say your line, then tap Done.</div>
          <button className="btn btn-primary btn-wide" onClick={stopListening}>Done</button>
          <div className="muted" style={{ fontSize: 13 }}>{listenNotice()}</div>
        </>
      )}
      {mode === 'heard' && (
        <>
          <div style={{ fontWeight: 800 }}>{missed === 0 ? 'I heard every word.' : `I did not hear ${missed} of ${flat.length} words (in red).`}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button className="btn btn-small" onClick={retype}>It misheard. Let me type</button>
            <button className="btn btn-small btn-primary" onClick={() => finish(marks, 0)}>That’s right</button>
          </div>
        </>
      )}
      {mode === 'review' && (
        <>
          <div style={{ fontWeight: 800 }} role="status">You missed {missed} of {flat.length} words. They are in red. Read the line once more, then try it again.</div>
          <button className="btn btn-primary btn-wide" onClick={tryAgain}>Hide it and try again</button>
        </>
      )}
      {mode === 'done' && (
        <div style={{ fontWeight: 800 }} role="status">
          {attempt === 2
            ? (missed === 0 ? 'Second try: every word right.' : `Second try: ${missed} still missed, in red.`)
            : (missed === 0 ? 'Every word right.' : `You missed ${missed} of ${flat.length} words. They are in red.`)}
        </div>
      )}
    </div>
  );
}
