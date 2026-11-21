// The three games that run through a scene: Cue Catch, Scene Partner, Speed Run.
import { useEffect, useMemo, useRef, useState } from 'react';
import { partIds, roleName, sceneById, seeded, speechItems, spokenLines, tokens, type Item, type Speech } from './lib/script';
import { finishGame, gameKey, record, setSettings, useProgress, type Outcome } from './lib/progress';
import { canSpeak, speak, stopSpeaking } from './lib/audio';
import { Bottom, CueBox, Verse, go } from './ui';
import { LessonChrome, Summary } from './lesson';
import { LineCheck } from './check';

type RunProps = { roleId: string; sceneId: string; exit: string };

const firstLetters = (line: string) =>
  tokens(line).map((t) => t.lead + (t.core ? t.core[0] + '·'.repeat(Math.min(6, t.core.length - 1)) : '') + t.trail).join(' ');

const clock = (ms: number) => {
  const s = Math.round(ms / 100) / 10;
  return s >= 60 ? `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}` : `${s.toFixed(1)}s`;
};

// --- Cue Catch ------------------------------------------------------------------
type Beat = { who: string; role?: string; speechId?: string; text: string; isCue: boolean };
type Round = { item: Item; beats: Beat[] };

function buildRounds(roleId: string, sceneId: string): Round[] {
  const scene = sceneById.get(sceneId)!;
  const wanted = new Set(speechItems(roleId, sceneId).map((s) => s.id));
  const mine = new Map(speechItems(roleId, sceneId).map((s) => [s.id, s]));
  const rand = seeded(sceneId + roleId + Date.now());
  const rounds: Round[] = [];
  scene.items.forEach((it, i) => {
    if (it.k !== 's' || it.role !== roleId || !wanted.has(it.id)) return;
    const before: Beat[] = [];
    let direction: Beat | null = null;
    for (let j = i - 1; j >= 0; j--) {
      const p = scene.items[j];
      if (p.k === 's' && p.role === roleId) break;
      if (p.k === 'd') { direction ??= { who: 'Stage', text: p.text, isCue: false }; continue; }
      const sp = spokenLines(p.lines);
      if (sp.length) before.unshift({ who: roleName(p.role), role: p.role, speechId: p.id, text: sp.slice(-2).join(' '), isCue: false });
    }
    const want = 1 + Math.floor(rand() * 3);
    const beats = before.length ? before.slice(-want) : direction ? [direction] : [];
    if (!beats.length) return;
    beats[beats.length - 1] = { ...beats[beats.length - 1], isCue: true };
    rounds.push({ item: mine.get(it.id)!, beats });
  });
  return rounds;
}

export function CueCatch({ roleId, sceneId, exit }: RunProps) {
  const rounds = useMemo(() => buildRounds(roleId, sceneId), [roleId, sceneId]);
  const [r, setR] = useState(0);
  const [b, setB] = useState(0);
  const [phase, setPhase] = useState<'watch' | 'say'>('watch');
  const [caught, setCaught] = useState(false);
  const [early, setEarly] = useState(0);
  const [flash, setFlash] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [tally, setTally] = useState({ good: 0, ok: 0, miss: 0 });
  const [finished, setFinished] = useState(false);
  const [skipped, setSkipped] = useState(0);
  // On stage, cues are heard, not read. "listen" speaks the other lines and hides their words.
  const [sound, setSound] = useState<'watch' | 'listen' | null>(canSpeak() ? null : 'watch');
  const rate = useProgress().settings.rate;
  const round = rounds[r];

  useEffect(() => () => stopSpeaking(), []);
  useEffect(() => {
    if (finished || !round || phase !== 'watch' || !sound) return;
    const beat = round.beats[b];
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const after = () => { if (!live) return; if (beat.isCue) { setCaught(false); setPhase('say'); } else setB(b + 1); };
    if (sound === 'listen' && beat.who !== 'Stage') {
      speak(beat.text, beat.role ?? beat.who, rate, beat.speechId).then(() => { if (live) timer = setTimeout(after, beat.isCue ? 2500 : 350); });
    } else {
      const read = Math.max(1600, Math.min(5000, 900 + beat.text.length * 55));
      timer = setTimeout(after, beat.isCue ? read + 2500 : read);
    }
    return () => { live = false; if (timer) clearTimeout(timer); if (sound === 'listen') stopSpeaking(); };
  }, [round, b, phase, sound, rate, finished]);

  if (!rounds.length) return <Summary title="No cues to catch here" lines={['You start this scene, or you have no lines in it.']} exit={exit} />;
  if (finished) {
    return <Summary title="Cue Catch done!" exit={exit} lines={[`You caught ${tally.good + tally.ok} of ${tally.good + tally.ok + tally.miss} practised cues.`, ...(skipped ? [`${skipped} skipped. Their progress has not changed.`] : []), tally.miss ? `${tally.miss} slipped past. Try again soon.` : skipped ? 'Come back to the skipped cues when you need them.' : 'Not one got past you.']} />;
  }

  if (!sound) {
    return (
      <div className="page">
        <div style={{ display: 'flex', alignItems: 'center', minHeight: 48 }}>
          <button className="btn-plain" style={{ fontSize: 22, paddingLeft: 0 }} onClick={() => go(exit)} aria-label="Close">✕</button>
        </div>
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ fontSize: 48 }} aria-hidden="true">🎯</div>
          <h1>Cue Catch</h1>
          <div className="muted">The scene plays. Tap the button the moment it is your turn to speak.</div>
          <button className="tile" onClick={() => setSound('watch')}>
            <span className="tile-icon" aria-hidden="true">👀</span>
            <span><b>Read the cues</b><br /><span className="muted" style={{ fontSize: 15 }}>The other lines appear on screen</span></span>
          </button>
          <button className="tile" onClick={() => setSound('listen')}>
            <span className="tile-icon" aria-hidden="true">👂</span>
            <span><b>Listen for the cues</b><br /><span className="muted" style={{ fontSize: 15 }}>The other lines are spoken, with no words to read. Harder, and more like the stage</span></span>
          </button>
        </div>
      </div>
    );
  }

  const tap = () => {
    if (round.beats[b].isCue) { setCaught(true); setPhase('say'); }
    else { setEarly(early + 1); setFlash(flash + 1); }
  };
  const next = (skipping = false) => {
    if (skipping) setSkipped(n => n + 1);
    const outcome: Outcome = !caught ? 'miss' : early ? 'ok' : 'good';
    if (!skipping) {
      record(partIds(round.item), outcome, 4);
      setTally((t) => ({ ...t, [outcome]: t[outcome] + 1 }));
    }
    if (r + 1 >= rounds.length) { if (!skipped && !skipping) finishGame(gameKey(roleId, sceneId, 'cue')); setFinished(true); return; }
    setR(r + 1); setB(0); setPhase('watch'); setCaught(false); setEarly(0); setRevealed(false);
  };

  return (
    <LessonChrome progress={(r + (phase === 'say' ? 0.5 : 0)) / rounds.length} exit={exit} onSkip={() => next(true)}>
      <h2 style={{ marginBottom: 12 }}>{phase === 'watch' ? (sound === 'listen' ? 'Listen for your cue…' : 'Wait for your cue…') : caught ? 'Caught it! Now say your line.' : 'That was your cue.'}</h2>
      <div style={{ display: 'grid', gap: 10 }}>
        {round.beats.slice(0, b + 1).map((beat, i) => (
          <div key={`${r}-${i}`} className="card rise" style={phase === 'say' && beat.isCue ? { borderColor: caught ? 'var(--good)' : 'var(--bad)' } : undefined}>
            <div className="eyebrow">{beat.who}</div>
            {sound === 'listen' && phase === 'watch' && beat.who !== 'Stage'
              ? <div className="muted">{i === b ? '🔊 Speaking…' : 'Spoke.'}</div>
              : <div className="verse" style={{ fontSize: 18, fontStyle: beat.who === 'Stage' ? 'italic' : undefined }}>{beat.text}</div>}
          </div>
        ))}
        {phase === 'say' && (
          <div className="mine pop">
            <div className="eyebrow">{roleName(roleId)}</div>
            {revealed ? <Verse lines={round.item.lines} /> : <div className="verse muted">{firstLetters(round.item.lines[0])}{round.item.lines.length > 1 ? ' …' : ''}</div>}
          </div>
        )}
      </div>
      <Bottom tone={phase === 'say' ? (caught ? (early ? 'ok' : 'good') : 'miss') : undefined}>
        {phase === 'watch' ? (
          <>
            {flash > 0 && <div key={flash} className="verdict shake" style={{ color: 'var(--warn)' }}>Not yet!</div>}
            <button className="btn btn-gold btn-wide" style={{ minHeight: 64, fontSize: 20 }} onClick={tap}>That’s my cue!</button>
          </>
        ) : !revealed ? (
          <button className="btn btn-primary btn-wide" onClick={() => setRevealed(true)}>Show my line</button>
        ) : (
          <button className="btn btn-primary btn-wide" onClick={() => next()}>Continue</button>
        )}
      </Bottom>
    </LessonChrome>
  );
}

// --- Scene Partner -----------------------------------------------------------------
type Mode = 'see' | 'letters' | 'hidden';
const MODES: { id: Mode; name: string; blurb: string; cap: number }[] = [
  { id: 'see', name: 'Script in hand', blurb: 'Your lines are shown', cap: 2 },
  { id: 'letters', name: 'First letters', blurb: 'A hint for each word', cap: 4 },
  { id: 'hidden', name: 'Off book', blurb: 'Your lines are hidden', cap: 5 },
];

export function ScenePartner({ roleId, sceneId, exit }: RunProps) {
  const progress = useProgress();
  const scene = sceneById.get(sceneId)!;
  const mine = useMemo(() => new Map(speechItems(roleId, sceneId).map((s) => [s.id, s])), [roleId, sceneId]);
  const [mode, setMode] = useState<Mode | null>(null);
  const [chosen, setChosen] = useState<Mode>('letters');
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [checked, setChecked] = useState<Outcome | null>(null);
  const [tally, setTally] = useState({ good: 0, miss: 0 });
  const [skipped, setSkipped] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const voice = progress.settings.voice && canSpeak();
  const rate = progress.settings.rate;
  const item = scene.items[idx];
  const isMine = item?.k === 's' && item.role === roleId && mine.has(item.id);

  useEffect(() => () => stopSpeaking(), []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [idx, checked]);
  useEffect(() => {
    if (!mode || paused || !item || isMine) return;
    let live = true;
    const advance = () => { if (live) setIdx((i) => i + 1); };
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (item.k === 'd') timer = setTimeout(advance, 1300);
    else {
      const text = spokenLines(item.lines).join(' ');
      if (!text) advance();
      else if (voice) speak(text, item.role, rate, item.id).then(() => { if (live) timer = setTimeout(advance, 250); });
      else timer = setTimeout(advance, Math.min(7000, 900 + text.length * 50) / rate);
    }
    return () => { live = false; if (timer) clearTimeout(timer); stopSpeaking(); };
  }, [mode, idx, paused, voice, rate, item, isMine]);

  if (!mine.size) return <Summary title="No lines here" lines={['You have no lines in this scene.']} exit={exit} />;

  if (!mode) {
    return (
      <div className="page">
        <div style={{ display: 'flex', alignItems: 'center', minHeight: 48 }}>
          <button className="btn-plain" style={{ fontSize: 22, paddingLeft: 0 }} onClick={() => go(exit)} aria-label="Close">✕</button>
        </div>
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ fontSize: 48 }} aria-hidden="true">🎭</div>
          <h1>Scene Partner</h1>
          <div className="muted">Your device reads the other parts and stops for yours. Say your line out loud, then check it.</div>
          {MODES.map((m) => (
            <button key={m.id} className="tile" onClick={() => setChosen(m.id)} aria-pressed={chosen === m.id}
              style={chosen === m.id ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : undefined}>
              <span><b>{m.name}</b><br /><span className="muted" style={{ fontSize: 15 }}>{m.blurb}</span></span>
            </button>
          ))}
          {canSpeak() ? (
            <div className="card" style={{ display: 'grid', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 800 }}>
                <input type="checkbox" checked={progress.settings.voice} onChange={(e) => setSettings({ voice: e.target.checked })} style={{ width: 22, height: 22 }} />
                Read the other parts out loud
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[['Slow', 0.8], ['Normal', 1], ['Fast', 1.2]].map(([label, value]) => (
                  <button key={label} className="btn btn-small" style={rate === value ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
                    onClick={() => setSettings({ rate: value as number })}>{label}</button>
                ))}
              </div>
            </div>
          ) : <div className="muted" style={{ fontSize: 14 }}>This device has no built-in voice, so the other parts will appear as text.</div>}
        </div>
        <Bottom><button className="btn btn-primary btn-wide" onClick={() => setMode(chosen)}>Start the scene</button></Bottom>
      </div>
    );
  }

  if (idx >= scene.items.length) {
    return <Summary title="Scene complete!" exit={exit} again={() => { setIdx(0); setTally({ good: 0, miss: 0 }); setSkipped(0); setChecked(null); }}
      lines={[`${tally.good} of ${tally.good + tally.miss} practised speeches went well.`, ...(skipped ? [`${skipped} speeches skipped. Their progress has not changed.`] : []), mode === 'hidden' && !tally.miss && !skipped && tally.good === mine.size ? 'You are off book for this scene!' : 'Run it again to make it stick.']} />;
  }

  const rateMine = (o: Outcome) => {
    const sp = mine.get((item as Speech).id)!;
    record(partIds(sp), o, MODES.find((m) => m.id === mode)!.cap);
    setTally((t) => (o === 'miss' ? { ...t, miss: t.miss + 1 } : { ...t, good: t.good + 1 }));
    setChecked(null);
    if (!skipped && idx + 1 >= scene.items.length) finishGame(gameKey(roleId, sceneId, 'partner'));
    setIdx(idx + 1);
  };

  return (
    <LessonChrome progress={idx / scene.items.length} exit={exit} onSkip={checked ? undefined : () => {
      stopSpeaking(); setChecked(null); if (isMine) setSkipped(n => n + 1); setIdx(idx + 1);
    }}>
      <div style={{ display: 'grid', gap: 10 }}>
        {scene.items.slice(Math.max(0, idx - 3), idx + 1).map((it, k, arr) => {
          const current = k === arr.length - 1;
          if (it.k === 'd') return <div key={it.text + k} className="muted" style={{ fontStyle: 'italic', fontSize: 15 }}>[{it.text}]</div>;
          const me = it.role === roleId;
          const lines = spokenLines(it.lines);
          if (!lines.length) return null;
          if (me && current && mode !== 'see') {
            const portion = { lines, partial: false };
            return (
              <div key={it.id} style={{ display: 'grid', gap: 8 }}>
                <div className="eyebrow">{roleName(it.role)} · you{portion.partial ? ' · checking the start of this speech' : ''}</div>
                {mode === 'letters' && !checked && <div className="verse muted" style={{ fontSize: 16 }}>{portion.lines.map((l, n) => <div key={n}>{firstLetters(l)}</div>)}</div>}
                <LineCheck previousContextLines={scene.items.slice(Math.max(0,idx-2),idx).flatMap(previous=>previous.k==='s'?spokenLines(previous.lines):[])} lines={portion.lines} maxRecordingSeconds={300} onDone={setChecked} />
                {checked && portion.partial && <div className="card-soft"><div className="eyebrow">The whole speech</div><Verse lines={lines} /></div>}
              </div>
            );
          }
          return (
            <div key={it.id} className={me ? 'mine' : 'card'} style={{ opacity: current ? 1 : 0.55 }}>
              <div className="eyebrow">{roleName(it.role)}{me ? ' · you' : ''}</div>
              <Verse lines={lines} />
            </div>
          );
        })}
        <div ref={endRef} style={{ height: 1, scrollMarginBottom: 170 }} />
      </div>
      <Bottom>
        {isMine ? (
          mode === 'see' ? (
            <button className="btn btn-primary btn-wide" onClick={() => rateMine('good')}>I said it. Next</button>
          ) : checked ? (
            <button className={`btn btn-wide ${checked === 'good' ? 'btn-good' : 'btn-primary'}`} onClick={() => rateMine(checked)}>Continue</button>
          ) : (
            <div className="muted" style={{ fontSize: 14, textAlign: 'center' }}>Your turn. Say your line, then check it above.</div>
          )
        ) : (
          <button className="btn btn-wide" onClick={() => setPaused(!paused)}>{paused ? '▶ Resume' : '⏸ Pause'}</button>
        )}
      </Bottom>
    </LessonChrome>
  );
}

// --- Speed Run --------------------------------------------------------------------------
export function SpeedRun({ roleId, sceneId, exit }: RunProps) {
  const list = useMemo(() => speechItems(roleId, sceneId), [roleId, sceneId]);
  const key = gameKey(roleId, sceneId, 'speed');
  const progress = useProgress();
  const best = progress.games[key]?.best;
  const [started, setStarted] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [i, setI] = useState(0);
  const [checked, setChecked] = useState<Outcome | null>(null);
  const [misses, setMisses] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [result, setResult] = useState<{ ms: number; wasBest: boolean } | null>(null);

  useEffect(() => {
    if (started == null || result) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [started, result]);

  if (!list.length) return <Summary title="No lines here" lines={['You have no lines in this scene.']} exit={exit} />;
  if (result) {
    return <Summary title={result.wasBest ? 'New best time!' : 'Speed Run done!'} exit={exit}
      again={() => { setResult(null); setStarted(null); setI(0); setMisses(0); setSkipped(0); setChecked(null); }}
      lines={[`Your time: ${clock(result.ms)}${misses ? ` (includes ${misses * 5}s for ${misses} missed)` : ''}`, ...(skipped ? [`${skipped} skipped. This practice run does not set a best time or change skipped-line progress.`] : []), best != null ? `Best: ${clock(best)}` : '']} />;
  }
  if (started == null) {
    return (
      <div className="page" style={{ display: 'grid', gap: 14, alignContent: 'center', minHeight: '75vh', textAlign: 'center' }}>
        <div style={{ fontSize: 56 }} aria-hidden="true">⚡</div>
        <h1>Speed Run</h1>
        <div className="muted">{list.length} cues. Say each complete speech, then type its first letters or use listening. A missed speech adds 5 seconds. Full-speech runs have their own best times.</div>
        <div className="muted">Listening allows up to five minutes per speech.</div>
        {best != null && <div className="chip chip-accent" style={{ justifySelf: 'center' }}>Best: {clock(best)}</div>}
        <Bottom>
          <button className="btn btn-wide" onClick={() => go(exit)}>Back</button>
          <button className="btn btn-gold btn-wide" onClick={() => { setStarted(Date.now()); setNow(Date.now()); }}>Go!</button>
        </Bottom>
      </div>
    );
  }

  const item = list[i];
  const rateIt = (o: Outcome | null) => {
    if (o) record(partIds(item), o, 5);
    else setSkipped(n => n + 1);
    const m = misses + (o === 'miss' ? 1 : 0);
    setMisses(m);
    if (i + 1 >= list.length) {
      const ms = Date.now() - started + m * 5000;
      if (!skipped && o) finishGame(key, ms);
      setResult({ ms, wasBest: !skipped && o != null && (best == null || ms < best) });
      return;
    }
    setI(i + 1);
    setChecked(null);
  };

  return (
    <LessonChrome progress={i / list.length} exit={exit} onSkip={checked ? undefined : () => rateIt(null)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span className="chip">{i + 1} / {list.length}</span>
        <span style={{ fontWeight: 900, fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>{clock(now - started + misses * 5000)}</span>
      </div>
      <div style={{ display: 'grid', gap: 16 }}>
        <CueBox cue={item.cue} why={item.why} />
        <LineCheck previousContextLines={item.cue ? [item.cue.text] : []} key={item.id} lines={item.lines} maxRecordingSeconds={300} retry={false} onDone={setChecked} />
      </div>
      {checked && (
        <Bottom tone={checked}>
          <button className={`btn btn-wide ${checked === 'good' ? 'btn-good' : 'btn-primary'}`} onClick={() => rateIt(checked)} autoFocus>Next</button>
        </Bottom>
      )}
    </LessonChrome>
  );
}
