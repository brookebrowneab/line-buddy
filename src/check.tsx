// Checks a spoken line for the kid, so they do not have to judge themselves.
// Default: type the first letter of each word from memory. Optional: let the
// device listen locally, with typing as the fallback when it mishears.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { tokens } from './lib/script';
import { useProgress, type Outcome } from './lib/progress';
import { canRecord, recordSpeech, transcribeRecording } from './lib/transcription';
import type { Recording } from './lib/transcription';
import { initializeWhisper, subscribeWhisper, whisperState } from './lib/local-whisper';

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

export function LineCheck({ lines, onDone, partial, retry = true, maxRecordingSeconds = 90, previousContextLines = [] }: { lines: string[]; onDone: (o: Outcome) => void; partial?: boolean; retry?: boolean; maxRecordingSeconds?: number; previousContextLines?: string[] }) {
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
  const recordingRef = useRef<Recording | null>(null);
  const transcriptionRef = useRef<AbortController | null>(null);
  const sessionRef = useRef(0);
  const { showTranscripts, microphone } = useProgress().settings;
  const [phase, setPhase] = useState<'starting' | 'recording' | 'transcribing'>('recording');
  const localStatus = useSyncExternalStore(subscribeWhisper,whisperState);
  const [comparisons, setComparisons] = useState<{text:string;label:string}|null>(null);
  useEffect(() => () => { sessionRef.current++; recordingRef.current?.cancel(); transcriptionRef.current?.abort(); }, []);
  useEffect(() => {
    if (microphone) return;
    sessionRef.current++;
    recordingRef.current?.cancel(); transcriptionRef.current?.abort();
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
    return () => { window.removeEventListener('keydown', on); };
  }, []);

  const listen = () => { if (microphone) void listenLocal(); };
  const showTranscript = (transcript: string, label: string) => {
    setComparisons({ text: transcript.trim(), label });
    if (!transcript.trim()) { setNote('No words were heard. Try again or type the first letters.'); setMode('type'); return; }
    const result = alignHeard(flat.map(x => x.t.core), transcript.split(/\s+/).filter(Boolean));
    setMarks(Object.fromEntries(flat.map((x, i) => [x.key, result.hit[i] ? 'ok' : 'missed'] as const)));
    setSaid(Object.fromEntries(flat.flatMap((x, i) => result.said[i] ? [[x.key, result.said[i]!] as const] : [])));
    setMode('heard');
  };
  const listenLocal = async () => {
    const session = ++sessionRef.current;
    setPhase('starting'); setMode('listening'); setNote(''); setMarks({}); setSaid({});
    try {
      const initialization = new AbortController(); transcriptionRef.current = initialization;
      await initializeWhisper(initialization.signal);
      if (session !== sessionRef.current) return;
      const recording = await recordSpeech(async audio => {
        if (session !== sessionRef.current) return;
        setPhase('transcribing');
        const controller = new AbortController(); transcriptionRef.current = controller;
        try {
          const result = await transcribeRecording(audio, controller.signal, flat.map(word => word.t.core).join(' '), previousContextLines);
          if (session === sessionRef.current) showTranscript(result.text, result.model);
        } catch (error) {
          if (session === sessionRef.current) {
            setNote(controller.signal.aborted ? 'Local speech checking was cancelled.' : (error instanceof Error ? error.message : 'Local speech checking failed. You can type instead.'));
            setMode('type');
          }
        }
      }, message => {
        if (session === sessionRef.current) { setNote(message); setMode('type'); }
      }, maxRecordingSeconds);
      if (session !== sessionRef.current) { recording.cancel(); return; }
      recordingRef.current = recording; setPhase('recording');
    } catch (error) {
      if (session === sessionRef.current) { setNote(error instanceof Error ? error.message : 'Could not start local listening. You can type instead.'); setMode('type'); }
    }
  };
  const stopListening = () => { recordingRef.current?.stop(); };
  const cancelListening = () => {
    sessionRef.current++; recordingRef.current?.cancel(); transcriptionRef.current?.abort();
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
            <button className="btn btn-small" disabled={!microphone || !canRecord()} onClick={listen}>Listen to me</button>
          </div>
          <p className="muted" style={{fontSize:13,margin:0}}>{!microphone ? 'Microphone features are off in App settings.' : 'Listening runs on this device. Your voice recording is never uploaded.'} You can type instead. <a href="#/parents">Parent notice</a></p>
          {note && <div className="muted" style={{ fontSize: 14 }} role="status">{note}</div>}
        </>
      )}
      {mode === 'listening' && (
        <>
          <div className="card-soft" role="status" style={{ textAlign: 'center' }}>{phase === 'starting' ? (localStatus.phase === 'loading' ? localStatus.message : 'Waiting for microphone permission…') : phase === 'transcribing' ? localStatus.message : `Listening… say your line, then tap Done.`}</div>
          {(localStatus.phase === 'loading' || localStatus.phase === 'transcribing') && <progress aria-label="Local speech model progress" max={100} value={localStatus.progress} style={{width:'100%'}} />}
          <button className="btn btn-primary btn-wide" disabled={phase !== 'recording'} onClick={stopListening}>Done</button>
          <button className="btn btn-small" onClick={cancelListening}>Cancel</button>
          <div className="muted" style={{ fontSize: 13 }}>Audio stays in memory on this device. First use downloads the speech model; later uses load it from browser storage when available.</div>
        </>
      )}
      {mode === 'heard' && (
        <>
          <button className="btn btn-small" disabled={!microphone || !canRecord()} onClick={listen}>Record again</button>
          <div style={{ fontWeight: 800 }}>{missed === 0 ? 'I heard every word.' : `I did not hear ${missed} of ${flat.length} words (in red).`}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button className="btn btn-small" onClick={retype}>It misheard. Let me type</button>
            <button className="btn btn-small btn-primary" onClick={() => finish(marks, 0)}>That’s right</button>
          </div>
        </>
      )}
      {showTranscripts && comparisons && (mode === 'type' || mode === 'heard') && (
        <details className="transcript-comparison" open>
          <summary>Transcription details</summary>
          <p className="muted">{comparisons.label}. Recognition uses the script as context and may mishear or guess. This is practice feedback, not proof of perfect recall.</p>
          <p>{comparisons.text || 'No words heard.'}</p>
          <p className="muted">This transcript is not saved after leaving the question.</p>
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
