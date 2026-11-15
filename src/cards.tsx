// One screen of practice each. A card calls onOutcome once, when the kid has finished it.
import { useEffect, useMemo, useRef, useState } from 'react';
import { seeded, shuffle, tokens, type Item } from './lib/script';
import type { Outcome } from './lib/progress';
import type { Step } from './lib/games';
import { canRecord, startRecording, type Recording } from './lib/audio';
import { CueBox, Verse } from './ui';
import { LineCheck } from './check';

type CardProps = { step: Step; onOutcome: (o: Outcome) => void; done: boolean };

const byErrors = (errors: number, total: number): Outcome => {
  const share = total ? errors / total : 0;
  return errors === 0 || share <= 0.1 ? 'good' : share <= 0.34 ? 'ok' : 'miss';
};

function PartLabel({ item }: { item: Item }) {
  return item.parts > 1 ? <span className="chip">Part {item.part + 1} of {item.parts}</span> : null;
}

// --- Understand ---------------------------------------------------------------
export function UnderstandCard({ step, onOutcome, done }: CardProps) {
  const { item } = step;
  return (
    <div className="rise" style={{ display: 'grid', gap: 16 }}>
      <CueBox cue={item.cue} />
      <div className="mine"><Verse lines={item.lines} /></div>
      {done ? (
        <div className="card-soft pop">
          <div className="eyebrow">In plain English</div>
          <div style={{ marginTop: 4 }}>{item.plain ?? 'No plain-English version for this line yet.'}</div>
          {item.why && <><div className="eyebrow" style={{ marginTop: 12 }}>Why you say it</div><div style={{ marginTop: 4 }}>{item.why}</div></>}
        </div>
      ) : (
        <button className="btn btn-wide" onClick={() => onOutcome('good')}>💡 What does it mean?</button>
      )}
    </div>
  );
}

// --- Thought cue: which line does this thought set off? ------------------------------
export function WhyCard({ step, onOutcome, done }: CardProps) {
  const [picked, setPicked] = useState<string | null>(null);
  const pick = (id: string) => {
    if (done) return;
    setPicked(id);
    onOutcome(id === step.item.id ? 'good' : 'miss');
  };
  return (
    <div className="rise" style={{ display: 'grid', gap: 14 }}>
      <h2>What do you say when this happens?</h2>
      <div className="thought-big"><span aria-hidden="true">💭 </span>{step.item.why}</div>
      {step.options!.map((o) => {
        const right = done && o.id === step.item.id;
        const wrong = done && picked === o.id && !right;
        return (
          <button key={o.id} className={`tile ${wrong ? 'shake' : ''}`} onClick={() => pick(o.id)}
            style={{ borderColor: right ? 'var(--good)' : wrong ? 'var(--bad)' : undefined, background: right ? 'var(--good-soft)' : wrong ? 'var(--bad-soft)' : undefined }}>
            <span className="verse" style={{ fontSize: 18 }}>{o.lines.slice(0, 2).join(' ')}{o.lines.length > 2 ? '…' : ''}</span>
          </button>
        );
      })}
      {done && step.item.cue && !step.item.cue.self && step.item.cue.who !== 'Stage' && (
        <div className="muted" style={{ fontSize: 14 }}>The words you will hear first: “…{step.item.cue.text}”</div>
      )}
    </div>
  );
}

// --- Match meaning to line ----------------------------------------------------
export function MatchCard({ step, onOutcome, done }: CardProps) {
  const [picked, setPicked] = useState<string | null>(null);
  const pick = (id: string) => {
    if (done) return;
    setPicked(id);
    onOutcome(id === step.item.id ? 'good' : 'miss');
  };
  return (
    <div className="rise" style={{ display: 'grid', gap: 14 }}>
      <h2>Which of your lines means this?</h2>
      <div className="card-soft">{step.item.plain}</div>
      {step.options!.map((o) => {
        const right = done && o.id === step.item.id;
        const wrong = done && picked === o.id && !right;
        return (
          <button key={o.id} className={`tile ${wrong ? 'shake' : ''}`} onClick={() => pick(o.id)}
            style={{ borderColor: right ? 'var(--good)' : wrong ? 'var(--bad)' : undefined, background: right ? 'var(--good-soft)' : wrong ? 'var(--bad-soft)' : undefined }}>
            <span className="verse" style={{ fontSize: 18 }}>{o.lines.slice(0, 2).join(' ')}{o.lines.length > 2 ? '…' : ''}</span>
          </button>
        );
      })}
    </div>
  );
}

// --- First letters --------------------------------------------------------------
export function LettersCard({ step, onOutcome, done }: CardProps) {
  const { item } = step;
  const lines = useMemo(() => item.lines.map(tokens), [item]);
  const flat = useMemo(() => lines.flatMap((l, li) => l.map((t, ti) => ({ key: `${li}-${ti}`, t }))).filter((x) => x.t.core), [lines]);
  const [shown, setShown] = useState<Record<string, 'typed' | 'peeked'>>({});
  const [errors, setErrors] = useState(0);
  const [shakeKey, setShakeKey] = useState(0);
  const next = flat.find((x) => !shown[x.key]);

  const finish = (map: Record<string, 'typed' | 'peeked'>, errs: number) => {
    const peeks = Object.values(map).filter((v) => v === 'peeked').length;
    onOutcome(byErrors(peeks + errs, flat.length));
  };
  const type = (ch: string) => {
    if (done || !next || !/^[a-z0-9]$/i.test(ch)) return;
    if (next.t.core[0].toLowerCase() === ch.toLowerCase()) {
      const map = { ...shown, [next.key]: 'typed' as const };
      setShown(map);
      if (flat.every((x) => map[x.key])) finish(map, errors);
    } else {
      setErrors((e) => e + 1);
      setShakeKey((k) => k + 1);
    }
  };
  const typeRef = useRef(type);
  typeRef.current = type;
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      typeRef.current(e.key);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  const peek = (key: string) => { if (!done && !shown[key]) setShown({ ...shown, [key]: 'peeked' }); };

  return (
    <div className="rise" style={{ display: 'grid', gap: 16 }}>
      <CueBox cue={item.cue} why={item.part === 0 ? item.why : undefined} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><h2 style={{ flex: 1 }}>Say your line</h2><PartLabel item={item} /></div>
      <div key={shakeKey} className={`verse mine ${shakeKey ? 'shake' : ''}`}>
        {lines.map((line, li) => (
          <div key={li}>
            {line.map((t, ti) => {
              const key = `${li}-${ti}`;
              const state = done ? shown[key] ?? 'typed' : shown[key];
              if (!t.core) return <span key={key} className="word">{t.lead}{t.trail}</span>;
              return (
                <span key={key} className="word">
                  {t.lead}
                  {state ? (
                    <span className={`letter ${state === 'peeked' ? 'peeked' : ''}`}>{t.core}</span>
                  ) : (
                    <span role="button" tabIndex={0} className={`letter hidden-word ${next?.key === key ? 'next' : ''}`}
                      onClick={() => peek(key)} onKeyDown={(e) => e.key === 'Enter' && peek(key)} aria-label="Hidden word, tap to peek">
                      {t.core[0]}{'·'.repeat(Math.min(6, Math.max(0, t.core.length - 1)))}
                    </span>
                  )}
                  {t.trail}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      {!done && (
        <>
          <input className="card" style={{ fontSize: 17, padding: '12px 14px', width: '100%', boxSizing: 'border-box', color: 'var(--ink)' }}
            placeholder="Type the first letter of each word…" value="" autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false}
            onChange={(e) => type(e.target.value.slice(-1))} aria-label="Type the first letter of each word" />
          <div className="muted" style={{ fontSize: 14 }}>Or say it out loud, tap any word you are stuck on, then finish.</div>
          <button className="btn btn-wide" onClick={() => finish(shown, errors)}>I said the whole line</button>
        </>
      )}
    </div>
  );
}

// --- Vanishing words -------------------------------------------------------------
export function VanishCard({ step, onOutcome, done }: CardProps) {
  const { item } = step;
  const share = step.blankShare ?? 0.3;
  const { lines, blanks, bank } = useMemo(() => {
    const ls = item.lines.map(tokens);
    const flat = ls.flatMap((l, li) => l.map((t, ti) => ({ key: `${li}-${ti}`, t }))).filter((x) => x.t.core);
    const rand = seeded(item.id + share);
    // Prefer hiding the meatier words first.
    const ranked = shuffle(flat, rand).sort((a, b) => Number(b.t.core.length > 3) - Number(a.t.core.length > 3));
    const count = Math.max(1, Math.min(flat.length, Math.round(flat.length * share)));
    const chosen = new Set(ranked.slice(0, count).map((x) => x.key));
    const ordered = flat.filter((x) => chosen.has(x.key));
    return { lines: ls, blanks: ordered, bank: shuffle(ordered.map((x, i) => ({ id: i, word: x.t.core })), rand) };
  }, [item, share]);
  const [filled, setFilled] = useState(0);
  const [used, setUsed] = useState<Set<number>>(new Set());
  const [errors, setErrors] = useState(0);
  const [wrong, setWrong] = useState<number | null>(null);
  const blankIndex = new Map(blanks.map((b, i) => [b.key, i]));

  const tap = (b: { id: number; word: string }) => {
    if (done || used.has(b.id)) return;
    if (b.word.toLowerCase() === blanks[filled].t.core.toLowerCase()) {
      setUsed(new Set(used).add(b.id));
      setWrong(null);
      if (filled + 1 === blanks.length) onOutcome(errors === 0 ? 'good' : errors <= 2 ? 'ok' : 'miss');
      setFilled(filled + 1);
    } else {
      setErrors(errors + 1);
      setWrong(b.id);
      setTimeout(() => setWrong((w) => (w === b.id ? null : w)), 300);
    }
  };

  return (
    <div className="rise" style={{ display: 'grid', gap: 16 }}>
      <CueBox cue={item.cue} why={item.part === 0 ? item.why : undefined} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><h2 style={{ flex: 1 }}>Fill the gaps</h2><PartLabel item={item} /></div>
      <div className="verse mine">
        {lines.map((line, li) => (
          <div key={li}>
            {line.map((t, ti) => {
              const key = `${li}-${ti}`;
              const bi = blankIndex.get(key);
              if (bi == null) return <span key={key} className="word">{t.lead}{t.core}{t.trail}</span>;
              const isFilled = done || bi < filled;
              return (
                <span key={key} className="word">
                  {t.lead}<span className={`blank ${isFilled ? 'filled' : bi === filled ? 'next' : ''}`}>{t.core}</span>{t.trail}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      {!done && (
        <div>
          {bank.map((b) => (
            <button key={b.id} className={`piece ${used.has(b.id) ? 'used' : ''} ${wrong === b.id ? 'shake' : ''}`} onClick={() => tap(b)}>{b.word}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Scramble -----------------------------------------------------------------------
export function ScrambleCard({ step, onOutcome, done }: CardProps) {
  const { item } = step;
  const { pieces, pool } = useMemo(() => {
    let ps: string[];
    if (item.lines.length >= 3) ps = item.lines;
    else {
      const words = item.lines.join(' ').split(/\s+/).filter(Boolean);
      const size = words.length <= 4 ? 1 : words.length <= 10 ? 2 : 3;
      ps = [];
      for (let i = 0; i < words.length; i += size) ps.push(words.slice(i, i + size).join(' '));
    }
    const indexed = ps.map((text, id) => ({ id, text }));
    const rand = seeded(item.id);
    let p = shuffle(indexed, rand);
    if (ps.length > 1 && p.every((x, i) => x.id === i)) p = [...p.slice(1), p[0]];
    return { pieces: ps, pool: p };
  }, [item]);
  const [placed, setPlaced] = useState(0);
  const [used, setUsed] = useState<Set<number>>(new Set());
  const [errors, setErrors] = useState(0);
  const [wrong, setWrong] = useState<number | null>(null);

  const tap = (p: { id: number; text: string }) => {
    if (done || used.has(p.id)) return;
    if (p.text === pieces[placed]) {
      setUsed(new Set(used).add(p.id));
      if (placed + 1 === pieces.length) onOutcome(errors === 0 ? 'good' : errors <= 2 ? 'ok' : 'miss');
      setPlaced(placed + 1);
    } else {
      setErrors(errors + 1);
      setWrong(p.id);
      setTimeout(() => setWrong((w) => (w === p.id ? null : w)), 300);
    }
  };
  const shownCount = done ? pieces.length : placed;

  return (
    <div className="rise" style={{ display: 'grid', gap: 16 }}>
      <CueBox cue={item.cue} why={item.part === 0 ? item.why : undefined} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><h2 style={{ flex: 1 }}>Put it in order</h2><PartLabel item={item} /></div>
      <div className="verse mine" style={{ minHeight: 64 }}>
        {shownCount === 0 && <span className="muted" style={{ fontSize: 16 }}>Tap the piece that comes first.</span>}
        {item.lines.length >= 3
          ? pieces.slice(0, shownCount).map((p, i) => <div key={i} className="pop">{p}</div>)
          : pieces.slice(0, shownCount).map((p, i) => <span key={i} className="word pop">{p}</span>)}
      </div>
      {!done && (
        <div>
          {pool.map((p) => (
            <button key={p.id} className={`piece ${used.has(p.id) ? 'used' : ''} ${wrong === p.id ? 'shake' : ''}`} onClick={() => tap(p)}>{p.text}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Say it ----------------------------------------------------------------------------
export function SayItCard({ step, onOutcome, done }: CardProps) {
  const { item } = step;
  const [rec, setRec] = useState<Recording | null>(null);
  const [clip, setClip] = useState<string | null>(null);
  const [micError, setMicError] = useState(false);
  useEffect(() => () => { if (clip) URL.revokeObjectURL(clip); }, [clip]);

  const toggleRecord = async () => {
    if (rec) { setClip(await rec.stop()); setRec(null); return; }
    try { setRec(await startRecording()); setMicError(false); } catch { setMicError(true); }
  };

  return (
    <div className="rise" style={{ display: 'grid', gap: 16 }}>
      {step.thoughtOnly
        ? <div className="thought-big"><span aria-hidden="true">💭 </span>{item.why}</div>
        : <CueBox cue={item.cue} why={item.part === 0 ? item.why : undefined} />}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><h2 style={{ flex: 1 }}>{step.thoughtOnly ? 'Say the line this sets off' : 'Say your line out loud'}</h2><PartLabel item={item} /></div>
      <LineCheck lines={item.lines} onDone={onOutcome} />
      {!done && canRecord() && (
        <button className="btn btn-small" onClick={toggleRecord}>{rec ? '⏹ Stop recording' : clip ? '🎙 Record again' : '🎙 Record myself to hear it back (optional)'}</button>
      )}
      {micError && <div className="muted" style={{ fontSize: 14 }}>The microphone is not available.</div>}
      {clip && <audio controls src={clip} style={{ width: '100%' }} />}
    </div>
  );
}

export function StepCard(props: CardProps) {
  switch (props.step.kind) {
    case 'understand': return <UnderstandCard {...props} />;
    case 'match': return <MatchCard {...props} />;
    case 'why': return <WhyCard {...props} />;
    case 'letters': return <LettersCard {...props} />;
    case 'vanish': return <VanishCard {...props} />;
    case 'scramble': return <ScrambleCard {...props} />;
    case 'sayit': return <SayItCard {...props} />;
  }
}
