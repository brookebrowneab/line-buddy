import { useEffect, useState, type ReactNode } from 'react';
import type { Cue } from './lib/script';

// --- tiny hash router -------------------------------------------------------
export const go = (path: string) => { window.location.hash = path; };
export function useRoute(): string[] {
  const read = () => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [parts, setParts] = useState(read);
  useEffect(() => {
    const on = () => { setParts(read()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return parts;
}

// --- shared pieces ----------------------------------------------------------
export function Ring({ value, size = 84, stroke = 7, children }: { value: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <span style={{ position: 'relative', width: size, height: size, display: 'inline-grid', placeItems: 'center' }}>
      <svg width={size} height={size} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={v >= 1 ? 'var(--gold)' : 'var(--good)'} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: 'stroke-dashoffset 400ms ease' }} />
      </svg>
      {children}
    </span>
  );
}

export function TopBar({ title, back, right }: { title?: string; back?: string; right?: ReactNode }) {
  return (
    <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 48, marginBottom: 8 }}>
      {back != null && (
        <button className="btn-plain" onClick={() => go(back)} aria-label="Back" style={{ fontSize: 22, paddingLeft: 0 }}>←</button>
      )}
      <div style={{ flex: 1, fontWeight: 900, fontSize: 18 }}>{title}</div>
      {right}
    </div>
  );
}

/** The cue for a line: the words to listen for, what they mean, and the thought that makes you speak. */
export function CueBox({ cue, why }: { cue: Cue; why?: string }) {
  const thought = why ? <div className="thought"><span aria-hidden="true">💭 </span>{why}</div> : null;
  if (!cue) return <div className="cue muted"><div className="eyebrow">Your cue</div>You speak first.{thought}</div>;
  return (
    <div className="cue">
      <div className="eyebrow">{cue.self ? 'You just said' : cue.who === 'Stage' ? 'Your cue (stage action)' : `Your cue · ${cue.who}`}</div>
      <div className="verse muted" style={{ fontSize: 17, fontStyle: 'italic' }}>{cue.who !== 'Stage' && !cue.self ? '…' : ''}{cue.text}</div>
      {cue.plain && <div className="muted" style={{ fontSize: 14 }}>Meaning: {cue.plain}</div>}
      {thought}
    </div>
  );
}

export function Verse({ lines, className = '' }: { lines: string[]; className?: string }) {
  return (
    <div className={`verse ${className}`}>
      {lines.map((l, i) => <div key={i}>{l}</div>)}
    </div>
  );
}

export function Bottom({ tone, children }: { tone?: 'good' | 'ok' | 'miss'; children: ReactNode }) {
  return (
    <div className={`bottom ${tone ?? ''}`}>
      <div className="bottom-inner">{children}</div>
    </div>
  );
}

export const pct = (v: number) => `${Math.round(v * 100)}%`;
