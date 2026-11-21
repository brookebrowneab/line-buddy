import { apiFetch } from './lib/api';
// Checks a spoken line for the kid, so they do not have to judge themselves.
// Default: type the first letter of each word from memory. Optional: let the
// browser listen (where it can), with typing as the fallback when it mishears.
import { useEffect, useMemo, useRef, useState } from 'react';
import { tokens } from './lib/script';
import { useProgress, type Outcome } from './lib/progress';
import { canRecord, recordSpeech, transcribeRecording } from './lib/transcription';
import type { Recording } from './lib/transcription';
import { startBrowserRecognition } from './lib/browser-recognition';

type Mark = 'ok' | 'missed';

import { alignHeard } from './lib/speech-match';
export { alignHeard, heardWords } from './lib/speech-match';

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

export function LineCheck({ lines, onDone, partial, retry = true, maxRecordingSeconds = 90 }: { lines: string[]; onDone: (o: Outcome) => void; partial?: boolean; retry?: boolean; maxRecordingSeconds?: number }) {
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
  const recordingRef = useRef<Recording | null>(null);
  const uploadRef = useRef<AbortController | null>(null);
  const sessionRef = useRef(0);
  const { speechProvider: provider, showTranscripts, microphone } = useProgress().settings;
  const [phase, setPhase] = useState<'starting' | 'recording' | 'transcribing'>('recording');
  const [elevenReady, setElevenReady] = useState(false);
  const [requiresPcm,setRequiresPcm]=useState(false);
  const [elevenStatus, setElevenStatus] = useState('Checking ElevenLabs connection…');
  const [comparisons, setComparisons] = useState<Partial<Record<'browser' | 'elevenlabs', { text: string; label: string }>>>({});
  useEffect(() => {
    const controller = new AbortController();
    apiFetch('/api/transcription/status', { signal: controller.signal }).then(r => {
      if (!r.ok) throw new Error();
      return r.json();
    }).then(result => {
      setElevenReady(result.configured === true && (!result.requiresClassCode || result.authorized));
      setRequiresPcm(result.requiresPcm === true);
      setElevenStatus(result.configured ? `ElevenLabs ready (${result.model}).` : 'ElevenLabs needs a server API key. Browser is still available.');
    }).catch(() => { if (!controller.signal.aborted) setElevenStatus('ElevenLabs server is unavailable. Browser is still available.'); });
    return () => { controller.abort(); sessionRef.current++; recordingRef.current?.cancel(); uploadRef.current?.abort(); };
  }, []);
  useEffect(() => {
    if (microphone) return;
    sessionRef.current++;
    recRef.current?.cancel(); recordingRef.current?.cancel(); uploadRef.current?.abort();
    setMode(current => current === 'listening' ? 'type' : current);
  }, [microphone]);
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
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.closest?.('input, select, textarea, button, summary, [contenteditable="true"]')) return;
      typeRef.current(e.key);
    };
    window.addEventListener('keydown', on);
    return () => { window.removeEventListener('keydown', on); try { recRef.current?.cancel(); } catch { /* already stopped */ } };
  }, []);

  const listen = () => {
    if (!microphone) return;
    if (provider === 'elevenlabs') { void listenEleven(); return; }
    const R = Recognition();
    if (!R) return;
    recRef.current?.cancel();
    const session = ++sessionRef.current;
    setPhase('starting'); setNote(''); setMarks({}); setSaid({}); setMode('listening');
    const rec = new R();
    recRef.current = startBrowserRecognition(rec,
      navigator.language?.startsWith('en') ? navigator.language : 'en-US', {
        ready: () => { if (session === sessionRef.current) setPhase('recording'); },
        complete: transcript => {
          if (session === sessionRef.current) showTranscript(transcript, 'browser', 'Browser');
        },
        error: message => {
          if (session !== sessionRef.current) return;
          sessionRef.current++; setNote(message); setMode('type');
        },
      });
  };
  const showTranscript = (transcript: string, source: 'browser' | 'elevenlabs', label: string) => {
    setComparisons(previous => ({ ...previous, [source]: { text: transcript.trim(), label } }));
    if (!transcript.trim()) { setNote('No words were heard. Try again or type the first letters.'); setMode('type'); return; }
    const result = alignHeard(flat.map(x => x.t.core), transcript.split(/\s+/).filter(Boolean));
    setMarks(Object.fromEntries(flat.map((x, i) => [x.key, result.hit[i] ? 'ok' : 'missed'] as const)));
    setSaid(Object.fromEntries(flat.flatMap((x, i) => result.said[i] ? [[x.key, result.said[i]!] as const] : [])));
    setMode('heard');
  };
  const listenEleven = async () => {
    const session = ++sessionRef.current;
    setPhase('starting'); setMode('listening'); setNote(''); setMarks({}); setSaid({});
    try {
      const recording = await recordSpeech(async audio => {
        if (session !== sessionRef.current) return;
        setPhase('transcribing');
        const controller = new AbortController(); uploadRef.current = controller;
        const timeout = setTimeout(() => controller.abort(), 65_000);
        try {
          const result = await transcribeRecording(audio, controller.signal, requiresPcm);
          if (session === sessionRef.current) showTranscript(result.text, 'elevenlabs', `ElevenLabs (${result.model})`);
        } catch (error) {
          if (session === sessionRef.current) {
            setNote(controller.signal.aborted ? 'Transcription timed out. Try again or use Browser.' : (error instanceof Error ? error.message : 'Transcription failed. Try Browser.'));
            setMode('type');
          }
        } finally { clearTimeout(timeout); }
      }, message => {
        if (session === sessionRef.current) { setNote(message); setMode('type'); }
      }, maxRecordingSeconds);
      if (session !== sessionRef.current) { recording.cancel(); return; }
      recordingRef.current = recording; setPhase('recording');
    } catch {
      if (session === sessionRef.current) { setNote('Could not access the microphone. Check permission or type the first letters.'); setMode('type'); }
    }
  };
  const stopListening = () => {
    if (provider === 'elevenlabs') recordingRef.current?.stop();
    else { try { recRef.current?.stop(); } catch { /* already stopped */ } }
  };
  const cancelListening = () => {
    sessionRef.current++; recordingRef.current?.cancel(); uploadRef.current?.abort();
    try { recRef.current?.cancel(); } catch { /* already stopped */ }
    setMode('type'); setNote('');
  };
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <button className="btn btn-small" onClick={() => next && mark(next.key, 'missed')}>I’m stuck on this word</button>
            <button className="btn btn-small" disabled={!microphone || (provider === 'browser' ? !canListen() : !canRecord() || !elevenReady)} onClick={listen}>Listen to me</button>
          </div>
          <p className="muted" style={{fontSize:13,margin:0}}>{!microphone ? 'Microphone features are off in App settings. Prerecorded character voices still work.' : provider === 'elevenlabs' ? 'Listening sends your recording to ElevenLabs when you tap Done or reach the time limit.' : 'Browser listening may send speech to the browser’s recognition provider.'} You can type instead. <a href="#/parents">Parent notice</a></p>
          {microphone && provider === 'browser' && !canListen() && <p className="muted">Listening is unavailable in this browser. You can type the first letters instead.</p>}
          {microphone && provider === 'elevenlabs' && !elevenReady && <p className="muted" role="status">Listening is unavailable right now. You can type the first letters instead.</p>}
          {note && <div className="muted" style={{ fontSize: 14 }} role="status">{note}</div>}
        </>
      )}
      {mode === 'listening' && (
        <>
          <div className="card-soft" role="status" style={{ textAlign: 'center' }}>{phase === 'starting' ? (provider === 'browser' ? 'Starting browser speech recognition…' : 'Waiting for microphone permission…') : phase === 'transcribing' ? 'Transcribing with ElevenLabs…' : `Listening… say your line, then tap Done.`}</div>
          <button className="btn btn-primary btn-wide" disabled={phase !== 'recording'} onClick={stopListening}>Done</button>
          <button className="btn btn-small" onClick={cancelListening}>Cancel</button>
          <div className="muted" style={{ fontSize: 13 }}>{provider === 'browser' ? listenNotice() : 'This recording is sent to ElevenLabs for transcription when you finish.'}</div>
        </>
      )}
      {mode === 'heard' && (
        <>
          <button className="btn btn-small" disabled={!microphone || (provider === 'browser' ? !canListen() : !canRecord() || !elevenReady)} onClick={listen}>Record again</button>
          <div style={{ fontWeight: 800 }}>{missed === 0 ? 'I heard every word.' : `I did not hear ${missed} of ${flat.length} words (in red).`}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button className="btn btn-small" onClick={retype}>It misheard. Let me type</button>
            <button className="btn btn-small btn-primary" onClick={() => finish(marks, 0)}>That’s right</button>
          </div>
        </>
      )}
      {showTranscripts && (mode === 'type' || mode === 'heard') && Object.keys(comparisons).length > 0 && (
        <details className="transcript-comparison" open>
          <summary>Transcription details</summary>
          <p className="muted">{elevenStatus}</p>
          <p className="muted">Latest recording per service for this speech. Say the same words for each test; these are separate takes. Nothing here is saved after leaving this check.</p>
          {(['browser', 'elevenlabs'] as const).map(source => comparisons[source] && <div key={source}>
            <strong>{comparisons[source]!.label}</strong>
            <p>{comparisons[source]!.text || 'No words heard.'}</p>
          </div>)}
        </details>
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
