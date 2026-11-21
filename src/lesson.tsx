// Runs a list of practice cards one at a time, Brilliant-style: one task per
// screen, a progress bar on top, one big button at the bottom.
import { useState, type ReactNode } from 'react';
import { record, type Outcome } from './lib/progress';
import type { Step } from './lib/games';
import { StepCard } from './cards';
import { Bottom, go } from './ui';

const VERDICT: Record<Outcome, string[]> = {
  good: ['Nice!', 'Spot on!', 'You know this one.', 'Great memory!'],
  ok: ['Nearly there.', 'So close.', 'Good try.'],
  miss: ['This one needs more practice.', 'Keep going. It will stick.', 'We will come back to this one.'],
};

export function LessonChrome({ progress, exit, children, onSkip }: { progress: number; exit: string; children: ReactNode; onSkip?: () => void }) {
  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 48, marginBottom: 12 }}>
        <button className="btn-plain" style={{ fontSize: 22, paddingLeft: 0 }} onClick={() => go(exit)} aria-label="Close">✕</button>
        <div className="bar" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${progress * 100}%` }} /></div>
        {onSkip && <button className="btn btn-small" onClick={onSkip} title="Move on without changing your progress on this question">Skip for now</button>}
      </div>
      {children}
    </div>
  );
}

export function Summary({ title, lines, exit, again, extra }: { title: string; lines: string[]; exit: string; again?: () => void; extra?: ReactNode }) {
  return (
    <div className="page" style={{ display: 'grid', alignContent: 'center', gap: 18, textAlign: 'center', minHeight: '80vh' }}>
      <div className="pop" style={{ fontSize: 72 }} aria-hidden="true">🌟</div>
      <h1>{title}</h1>
      <div className="muted">{lines.map((l, i) => <div key={i}>{l}</div>)}</div>
      {extra}
      <Bottom>
        {again && <button className="btn btn-wide" onClick={again}>Go again</button>}
        <button className="btn btn-primary btn-wide" onClick={() => go(exit)}>Continue</button>
      </Bottom>
    </div>
  );
}

export function Lesson({ steps, exit, title, onFinish, controls }: { steps: Step[]; exit: string; title: string; onFinish?: () => void; controls?: ReactNode }) {
  // Lines that are missed come back once more at the end of the lesson.
  const [queue, setQueue] = useState(steps);
  const [i, setI] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [tally, setTally] = useState({ good: 0, ok: 0, miss: 0 });
  const [finished, setFinished] = useState(false);
  const [skipped, setSkipped] = useState(0);

  if (!queue.length) {
    return (
      <div className="page" style={{ display: 'grid', gap: 16, alignContent: 'center', minHeight: '70vh', textAlign: 'center' }}>
        <h1>Nothing to practise here</h1>
        <div className="muted">You have no lines in this set right now.</div>
        <button className="btn btn-primary" onClick={() => go(exit)}>Back</button>
      </div>
    );
  }
  if (finished) {
    const total = tally.good + tally.ok + tally.miss;
    return (
      <Summary title={skipped ? `${title} practice finished` : `${title} done!`} exit={exit}
        lines={[total ? `${tally.good} of ${total} tries went well.` : 'No questions answered this time.', ...(skipped ? [`${skipped} skipped. Their progress has not changed.`] : []), tally.miss ? 'The lines you missed will come back in Today’s practice.' : skipped ? 'Come back to the skipped questions whenever you need them.' : 'Nothing to redo. Lovely work.']} />
    );
  }

  const step = queue[i];
  const quiet = step.kind === 'understand';
  const onOutcome = (o: Outcome) => {
    if (outcome) return;
    record(step.ids, o, step.cap);
    setOutcome(o);
    setTally((t) => ({ ...t, [o]: t[o] + 1 }));
    if (o === 'miss' && !step.again && step.kind !== 'understand' && step.kind !== 'match') {
      setQueue((q) => [...q, { ...step, again: true }]);
    }
  };
  const next = (skipping = false) => {
    if (i + 1 >= queue.length) { if (!skipped && !skipping) onFinish?.(); setFinished(true); return; }
    setI(i + 1);
    setOutcome(null);
    window.scrollTo(0, 0);
  };

  return (
    <LessonChrome progress={(i + (outcome ? 1 : 0)) / queue.length} exit={exit}
      onSkip={outcome ? undefined : () => { setSkipped(n => n + 1); next(true); }}>
      {controls && <div style={{ marginBottom: 8 }}>{controls}</div>}
      {!outcome && i + 1 < queue.length && (
        <details className="practice-jump">
          <summary>Choose a later question</summary>
          <label>Skip ahead without changing progress
            <select value="" aria-label="Jump to a later question" onChange={e => {
              const target = Number(e.target.value);
              if (target <= i || target >= queue.length) return;
              setSkipped(n => n + target - i); setI(target); setOutcome(null); window.scrollTo(0, 0);
            }}>
              <option value="" disabled>Choose a question…</option>
              {queue.slice(i + 1).map((candidate, offset) => <option key={i + offset + 1} value={i + offset + 1}>
                {i + offset + 2}. {candidate.item.lines[0].slice(0, 85)}{candidate.item.parts > 1 ? ` · part ${candidate.item.part + 1} of ${candidate.item.parts}` : ''}
              </option>)}
            </select>
          </label>
        </details>
      )}
      {step.again && <div className="chip chip-accent" style={{ marginBottom: 10 }}>Back again: you missed this one earlier</div>}
      <StepCard key={i} step={step} onOutcome={onOutcome} done={outcome != null} />
      {outcome && (
        <Bottom tone={quiet ? undefined : outcome}>
          {!quiet && <div className="verdict rise">{VERDICT[outcome][i % VERDICT[outcome].length]}</div>}
          <button className={`btn btn-wide ${outcome === 'good' && !quiet ? 'btn-good' : 'btn-primary'}`} onClick={() => next()} autoFocus>Continue</button>
        </Bottom>
      )}
    </LessonChrome>
  );
}
