import { lazy, Suspense } from 'react';
import { PrivacyLinks, PrivacyPage } from './privacy';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { allItems, items, roleById, roleName, sceneById, sceneLabel, script, spokenLines, type Role, type Scene } from './lib/script';
import {
  chooseRole, dayKey, dayNumber, exportData, finishGame, gameKey, getState, importData, levelOf, mastery, removeRole, resetAll, streak, useProgress,
  setSettings, type State,
} from './lib/progress';
import { GAMES, buildSteps, dueItems, gameById, todaySteps, troubleItems, troubleSteps, type GameId } from './lib/games';
import { Lesson } from './lesson';
import { LearningIntroduction } from './scene-context';
import { initializeWhisper, subscribeWhisper, whisperState } from './lib/local-whisper';
import { SpeechPlayback } from './speech-playback';
import { CueCatch, ScenePartner, SpeedRun } from './runs';
import { Bottom, Ring, TopBar, go, pct, useRoute } from './ui';

const LocalSttQa = import.meta.env.DEV ? lazy(()=>import('./local-stt-qa')) : null;

const HOUSE_LABEL = { montague: 'Montague', capulet: 'Capulet', neutral: 'Verona' } as const;

// --- Role picker --------------------------------------------------------------
function RolePicker({ state }: { state: State }) {
  const roles = useMemo(() => [...script.roles].sort((a, b) => b.words - a.words), []);
  const pick = (r: Role) => { chooseRole(r.id); go('/'); };
  return (
    <div className="page">
      {state.active ? <TopBar back="/" title="Roles" /> : <div style={{ height: 24 }} />}
      <div className="eyebrow">Line Buddy · {script.title.replace(/\b(\w)(\w*)/g, (_, a: string, b: string) => a + b.toLowerCase())}</div>
      <h1 style={{ margin: '6px 0 6px', fontSize: 32 }}>Who are you playing?</h1>
      <div className="muted" style={{ marginBottom: 18 }}>Pick your part. Understudies can add a second part later.</div>
      {state.roles.length > 0 && (
        <div style={{ marginBottom: 18, display: 'grid', gap: 8 }}>
          <div className="eyebrow">My parts</div>
          {state.roles.map((id) => (
            <div key={id} data-house={roleById.get(id)?.house} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn btn-small" style={{ flex: 1, justifyContent: 'flex-start', borderColor: state.active === id ? 'var(--accent)' : undefined }} onClick={() => pick(roleById.get(id)!)}>
                {roleName(id)}{state.active === id ? ' · current' : ''}
              </button>
              <button className="btn-plain" onClick={() => { if (confirm(`Remove ${roleName(id)} from your parts? Your progress on its lines is kept.`)) removeRole(id); }}>Remove</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'grid', gap: 10 }}>
        {roles.map((r) => (
          <button key={r.id} className="tile" data-house={r.house} onClick={() => pick(r)}>
            <span className="tile-icon" style={{ color: 'var(--accent)', fontWeight: 900, fontSize: 20 }}>{r.name.replace(/[^A-Z0-9]/g, '').slice(0, 2) || r.name[0]}</span>
            <span style={{ flex: 1 }}>
              <b style={{ fontSize: 18 }}>{r.name}</b><br />
              <span className="muted" style={{ fontSize: 14 }}>{HOUSE_LABEL[r.house]} · {r.speeches} {r.speeches === 1 ? 'speech' : 'speeches'} · {r.scenes.length} {r.scenes.length === 1 ? 'scene' : 'scenes'}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Home: the scene path -------------------------------------------------------
function Home({ state, role }: { state: State; role: Role }) {
  const scenes = role.scenes.map((id) => sceneById.get(id)!);
  const all = useMemo(() => allItems(role.id), [role.id]);
  const overall = mastery(state, all.map((i) => i.id));
  const today = dayNumber();
  const days = streak(state.days, today);
  const trouble = troubleItems(state, role.id).length;
  const due = dueItems(state, role.id).length;
  const offsets = [0, 44, 88, 44];
  let lastAct = -1;
  // The first scene that is not yet mastered is "up next".
  const upNext = scenes.find((s) => mastery(state, items(role.id, s.id).map((i) => i.id)) < 1)?.id;

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <div className="eyebrow">Romeo and Juliet</div>
          <h1 style={{ fontSize: 30 }}>{role.name}</h1>
        </div>
        <button className="btn btn-small" onClick={() => go('/settings')}>Settings</button>
        <button className="btn btn-small" onClick={() => go('/roles')}>Switch</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
        <button className="card" style={{ textAlign: 'center', padding: 12 }} onClick={() => go('/progress')}>
          <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--good)' }}>{pct(overall)}</div>
          <div className="eyebrow">Off book</div>
        </button>
        <button className="card" style={{ textAlign: 'center', padding: 12 }} onClick={() => go('/progress')}>
          <div style={{ fontSize: 26, fontWeight: 900 }}>🔥 {days}</div>
          <div className="eyebrow">Day streak</div>
        </button>
        <button className="card" style={{ textAlign: 'center', padding: 12 }} onClick={() => go('/progress')}>
          <div style={{ fontSize: 26, fontWeight: 900, color: trouble ? 'var(--bad)' : undefined }}>{trouble}</div>
          <div className="eyebrow">Trouble lines</div>
        </button>
      </div>

      <button className="btn btn-gold btn-wide" onClick={() => go('/play/today')}>
        ▶ Today’s practice{due ? ` · ${due} to review` : ''}
      </button>

      <div className="path">
        {scenes.map((s, n) => {
          const list = items(role.id, s.id);
          const m = mastery(state, list.map((i) => i.id));
          const started = list.some((i) => state.items[i.id]);
          const head = s.act !== lastAct;
          lastAct = s.act;
          return (
            <div key={s.id} style={{ display: 'contents' }}>
              {head ? <div className="act-pill">{s.act ? `Act ${s.act}` : 'Prologue'}</div>
                : <div className="node-row" style={{ paddingLeft: (offsets[n % 4] + offsets[(n - 1) % 4]) / 2 + 38 }}><span className="dot" /></div>}
              <div className="node-row" style={{ paddingLeft: offsets[n % 4] }}>
                <button className={`node ${m >= 1 ? 'done' : started || s.id === upNext ? '' : 'fresh'}`} onClick={() => go(`/scene/${s.id}`)} aria-label={`${sceneLabel(s)}: ${s.title}, ${pct(m)} learned`}>
                  <Ring value={m} />
                  <span className="node-core">{m >= 1 ? '★' : s.act ? `${s.act}.${s.scene}` : 'P'}</span>
                </button>
                <button onClick={() => go(`/scene/${s.id}`)} style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', minWidth: 0 }}>
                  <b>{s.title}</b>{s.id === upNext && <span className="chip chip-accent" style={{ marginLeft: 8 }}>Up next</span>}
                  <br /><span className="muted" style={{ fontSize: 14 }}>{list.length} {list.length === 1 ? 'part' : 'parts'} to learn · {pct(m)}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="muted" style={{ fontSize: 12, textAlign: 'center' }}>{script.credit}</div>
    </div>
  );
}

/** What happens in the scene, and what this kid's character wants in it. */
function SceneBrief({ scene, role }: { scene: Scene; role: Role }) {
  const want = scene.wants?.[role.id];
  if (!scene.summary && !want) return null;
  return (
    <div className="card-soft" style={{ marginBottom: 14, display: 'grid', gap: 10 }}>
      {scene.summary && <div><div className="eyebrow">What happens</div><div style={{ marginTop: 2 }}>{scene.summary}</div></div>}
      {want && <div><div className="eyebrow" style={{ color: 'var(--accent)' }}>What {role.name} wants</div><div style={{ marginTop: 2, fontWeight: 700 }}>{want}</div></div>}
    </div>
  );
}

// --- One scene: the list of games ------------------------------------------------------
function SceneScreen({ state, role, scene }: { state: State; role: Role; scene: Scene }) {
  const list = items(role.id, scene.id);
  const m = mastery(state, list.map((i) => i.id));
  const nextGame = GAMES.find((g) => !state.games[gameKey(role.id, scene.id, g.id)]?.done)?.id;
  return (
    <div className="page">
      <TopBar back="/" right={<button className="btn btn-small" onClick={() => go('/settings')}>Settings</button>} />
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16 }}>
        <Ring value={m} size={92} stroke={9}><b style={{ fontSize: 20 }}>{pct(m)}</b></Ring>
        <div>
          <div className="eyebrow">{sceneLabel(scene)}</div>
          <h1 style={{ fontSize: 26 }}>{scene.title}</h1>
          <div className="muted" style={{ fontSize: 14 }}>{list.length} {list.length === 1 ? 'part' : 'parts'} to learn as {role.name}</div>
        </div>
      </div>
      <SceneBrief scene={scene} role={role} />
      <button className="btn btn-wide" style={{ marginBottom: 16 }} onClick={() => go(`/read/${scene.id}`)}>📖 Read the whole scene</button>
      {list.length === 0 ? <div className="card-soft">You have no lines in this scene.</div> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {GAMES.map((g, n) => {
            const gs = state.games[gameKey(role.id, scene.id, g.id)];
            return (
              <button key={g.id} className="tile" onClick={() => go(`/play/${g.id}/${scene.id}`)} style={g.id === nextGame ? { borderColor: 'var(--accent)' } : undefined}>
                <span className="tile-icon" aria-hidden="true">{g.icon}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="muted" style={{ fontSize: 12, fontWeight: 800 }}>STEP {n + 1}</span><br />
                  <b>{g.name}</b><br /><span className="muted" style={{ fontSize: 14 }}>{g.blurb}</span>
                </span>
                {gs?.done ? <span className="chip chip-good">✓{gs.done > 1 ? ` ×${gs.done}` : ''}</span> : g.id === nextGame ? <span className="chip chip-accent">Start</span> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- Read the scene -----------------------------------------------------------------------
function ReadScene({ role, scene }: { role: Role; scene: Scene }) {
  const [plain, setPlain] = useState(false);
  return (
    <div className="page">
      <TopBar back={`/scene/${scene.id}`} title={scene.title}
        right={<button className="btn btn-small" aria-pressed={plain} style={plain ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined} onClick={() => setPlain(!plain)}>Plain English</button>} />
      <SceneBrief scene={scene} role={role} />
      <div style={{ display: 'grid', gap: 12 }}>
        {scene.items.map((it, i) => {
          if (it.k === 'd') return <div key={i} className="muted" style={{ fontStyle: 'italic', fontSize: 15 }}>[{it.text}]</div>;
          const me = it.role === role.id;
          return (
            <div key={it.id} className={me ? 'mine' : ''}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                <div className="eyebrow">{roleName(it.role)}{it.note ? ` (${it.note})` : ''}{me ? ' · you' : ''}</div>
                <SpeechPlayback id={it.id} role={it.role} text={spokenLines(it.lines).join(' ')} />
              </div>
              <div className="verse" style={{ fontSize: 18 }}>
                {it.lines.map((l, n) => /^\[[^\]]*\]$/.test(l)
                  ? <div key={n} className="muted" style={{ fontStyle: 'italic', fontSize: 15 }}>{l}</div>
                  : <div key={n}>{l}</div>)}
              </div>
              {plain && it.plain && <div className="muted" style={{ fontSize: 15, marginTop: 4 }}>{it.plain}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Progress ---------------------------------------------------------------------------------
function ProgressScreen({ state, role }: { state: State; role: Role }) {
  const all = useMemo(() => allItems(role.id), [role.id]);
  const overall = mastery(state, all.map((i) => i.id));
  const today = dayNumber();
  const trouble = troubleItems(state, role.id);
  const solid = all.filter((i) => levelOf(state, i.id) >= 4).length;
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState('');

  const save = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([exportData()], { type: 'application/json' }));
    a.download = `line-buddy-progress-${dayKey(today)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const load = async (f?: File) => {
    if (!f) return;
    setNote(importData(await f.text()) ? 'Progress loaded.' : 'That file is not a Line Buddy progress file.');
  };

  return (
    <div className="page">
      <TopBar back="/" title="My progress" />
      <div className="card" style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 14 }}>
        <Ring value={overall} size={104} stroke={10}><b style={{ fontSize: 24 }}>{pct(overall)}</b></Ring>
        <div>
          <div className="eyebrow">Romeo and Juliet</div>
          <h2 style={{ fontSize: 24 }}>{role.name}</h2>
          <div className="muted" style={{ fontSize: 15 }}>{solid} of {all.length} parts solid · 🔥 {streak(state.days, today)} day streak</div>
          <div className="muted" style={{ fontSize: 13 }}>{new Date().toLocaleDateString(undefined, { dateStyle: 'long' })}</div>
        </div>
      </div>

      <div className="eyebrow" style={{ marginBottom: 6 }}>Last two weeks</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(14, 1fr)', gap: 4, marginBottom: 18 }}>
        {Array.from({ length: 14 }, (_, k) => today - 13 + k).map((d) => (
          <div key={d} title={dayKey(d)} style={{ aspectRatio: '1', borderRadius: 6, background: state.days[dayKey(d)] ? 'var(--good)' : 'var(--surface)', outline: d === today ? '2px solid var(--ink)' : undefined }} />
        ))}
      </div>

      <div className="eyebrow" style={{ marginBottom: 6 }}>Scenes</div>
      <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
        {role.scenes.map((id) => {
          const s = sceneById.get(id)!;
          const m = mastery(state, items(role.id, id).map((i) => i.id));
          return (
            <button key={id} onClick={() => go(`/scene/${id}`)} style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}><span><b>{s.act ? `${s.act}.${s.scene}` : 'P'}</b> {s.title}</span><span className="muted">{pct(m)}</span></div>
              <div className="bar" style={{ height: 10 }}><i style={{ width: pct(m), background: m >= 1 ? 'var(--gold)' : undefined }} /></div>
            </button>
          );
        })}
      </div>

      <div className="eyebrow" style={{ marginBottom: 6 }}>Trouble lines ({trouble.length})</div>
      {trouble.length === 0 ? <div className="card-soft muted" style={{ marginBottom: 18 }}>None right now. Lines you miss show up here.</div> : (
        <div style={{ display: 'grid', gap: 8, marginBottom: 18 }}>
          {trouble.slice(0, 12).map((it) => (
            <div key={it.id} className="card" style={{ padding: 12 }}>
              <div className="eyebrow">{sceneLabel(sceneById.get(it.sceneId)!)}</div>
              <div className="verse" style={{ fontSize: 16 }}>{it.lines[0]}{it.lines.length > 1 ? ' …' : ''}</div>
            </div>
          ))}
          <button className="btn btn-primary btn-wide no-print" onClick={() => go('/play/trouble')}>Practise my trouble lines</button>
        </div>
      )}

      <div className="no-print" style={{ display: 'grid', gap: 10 }}>
        <div className="eyebrow">Share and back up</div>
        <button className="btn btn-wide" onClick={() => window.print()}>🖨 Print my progress card</button>
        <button className="btn btn-wide" onClick={save}>Save progress to a file</button>
        <button className="btn btn-wide" onClick={() => fileRef.current?.click()}>Load progress from a file</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => load(e.target.files?.[0])} />
        {note && <div className="muted" role="status">{note}</div>}
        <div className="muted" style={{ fontSize: 13 }}>Saved progress stays in this browser. Speech checking runs locally; microphone audio is never uploaded.</div>
        <button className="btn-plain" style={{ color: 'var(--bad)', justifySelf: 'start' }}
          onClick={() => { if (confirm('Erase all progress on this device? This cannot be undone.')) { resetAll(); go('/'); } }}>Erase all progress</button>
      </div>
    </div>
  );
}

// --- Play -----------------------------------------------------------------------------------------
function Play({ role, game, sceneId }: { role: Role; game: string; sceneId?: string }) {
  const [sceneInOrder, setSceneInOrder] = useState<boolean | null>(null);
  const isContextGame = game === 'understand' || game === 'why';
  const [practiceSize, setPracticeSize] = useState<'parts' | 'whole' | null>(null);
  const hasSizeChoice = ['sayit', 'letters', 'vanish', 'scramble'].includes(game);
  // Steps are fixed when the lesson opens, so they do not reshuffle as progress changes underneath.
  const steps = useMemo(() => {
    const s = getState();
    if (game === 'today') return todaySteps(s, role.id);
    if (game === 'trouble') return troubleSteps(s, role.id);
    if (!sceneId || !gameById.has(game as GameId) || ['cue', 'partner', 'speed'].includes(game)) return [];
    const planned = buildSteps(s, game as GameId, role.id, sceneId, practiceSize ?? 'parts');
    return sceneInOrder && game === 'understand' ? planned.filter(step => step.kind === 'understand') : planned;
  }, [game, role.id, sceneId, practiceSize, sceneInOrder]);

  if (game === 'today') return <Lesson steps={steps} exit="/" title="Today’s practice" />;
  if (game === 'trouble') return <Lesson steps={steps} exit="/progress" title="Trouble lines" />;
  if (!sceneId || !sceneById.has(sceneId) || !gameById.has(game as GameId)) return <NotFound />;
  const exit = `/scene/${sceneId}`;
  if (isContextGame && sceneInOrder === null) return <div className="page">
    <TopBar back={exit} title={gameById.get(game as GameId)!.name} />
    <LearningIntroduction scene={sceneById.get(sceneId)!} roleId={role.id} onChoose={inOrder => { setSceneInOrder(inOrder); window.scrollTo(0, 0); }} />
  </div>;
  if (hasSizeChoice && practiceSize === null) return <div className="page">
    <TopBar back={exit} title={gameById.get(game as GameId)!.name} />
    <h1>How much at once?</h1>
    <p className="muted">Practise a complete speech, or work on smaller parts. Both count toward the same progress.</p>
    <div style={{ display: 'grid', gap: 12, marginTop: 20 }}>
      <button className="tile" onClick={() => setPracticeSize('whole')}><span><b>Whole speeches</b><br /><span className="muted">One turn from your character, from beginning to end.</span></span></button>
      <button className="tile" onClick={() => setPracticeSize('parts')}><span><b>Short parts</b><br /><span className="muted">Learn long speeches a few lines at a time.</span></span></button>
    </div>
    <p className="muted">Use Skip for now or Choose a later question to reach the speech you want.</p>
  </div>;
  if (game === 'cue') return <CueCatch roleId={role.id} sceneId={sceneId} exit={exit} />;
  if (game === 'partner') return <ScenePartner roleId={role.id} sceneId={sceneId} exit={exit} />;
  if (game === 'speed') return <SpeedRun roleId={role.id} sceneId={sceneId} exit={exit} />;
  return <Lesson key={`${practiceSize}-${sceneInOrder}`} learningContext={isContextGame ? {scene:sceneById.get(sceneId)!,roleId:role.id,inOrder:sceneInOrder === true} : undefined} steps={steps} exit={exit} controls={isContextGame ? <button className="btn-plain" onClick={() => { setSceneInOrder(null); window.scrollTo(0, 0); }}>{sceneInOrder ? 'Scene in order' : 'Focus on my speeches'} · Change</button> : hasSizeChoice ? <button className="btn-plain" onClick={() => setPracticeSize(null)}>{practiceSize === 'whole' ? 'Whole speeches' : 'Short parts'} · Change</button> : undefined} title={gameById.get(game as GameId)!.name} onFinish={() => finishGame(gameKey(role.id, sceneId, game))} />;
}


function SettingsScreen({ state }: { state: State }) {
  const local = useSyncExternalStore(subscribeWhisper,whisperState);
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  const prepare=async()=>{controller.current=new AbortController();try{await initializeWhisper(controller.current.signal);}catch{/* state explains failure */}};
  return <div className="page">
    <TopBar back="/" title="App settings" />
    <h1>Listening</h1>
    <p className="muted">Set this once for all practice games on this device. Progress and settings stay in this browser.</p>
    <label className="settings-toggle"><input type="checkbox" checked={state.settings.microphone} onChange={e => setSettings({ microphone: e.target.checked })} /> Allow microphone features</label>
    <p className="muted">Microphone features are off by default. This switch controls both speech checking and recording yourself to hear it back. Reading, typing and prerecorded character voices work with it off. Ask a parent or teacher before turning it on.</p>
    <h2>On-device speech checking</h2>
    <p className="muted">Whisper base.en runs in this browser using its local CPU. Your audio and script context are never uploaded. First use downloads model files (roughly 80 MB plus its browser runtime) from Hugging Face; the browser caches them for later use. Browsers can clear this cache, so offline use requires a completed download.</p>
    <p role="status" className="muted">{local.message}</p>
    {local.phase === 'loading' && <progress max={100} value={local.progress} aria-label="Speech model download progress" style={{width:'100%'}} />}
    <button className="btn btn-small" disabled={local.phase==='loading'||local.phase==='transcribing'} onClick={()=>void prepare()}>{local.phase==='ready'?'Check model availability':'Prepare speech model'}</button>
    {local.phase === 'loading' && <button className="btn btn-small" onClick={()=>controller.current?.abort()}>Cancel preparation</button>}
    <p className="muted">Long speeches can take time on older phones. Cancel or use typing at any time. Recognition uses the script as context, so it may guess words that were not clearly spoken.</p>
    <h2 style={{ marginTop: 28 }}>Comparison tools</h2>
    <label className="settings-toggle"><input type="checkbox" checked={state.settings.showTranscripts} onChange={e => setSettings({ showTranscripts: e.target.checked })} /> Show transcription details during practice</label>
    <p className="muted">For testing: show the raw transcript and model name. Leave this off for everyday practice. Transcripts are not saved after leaving a question.</p>
    <p className="muted">Changes are saved automatically.</p>
  </div>;
}

function NotFound() {
  return (
    <div className="page" style={{ display: 'grid', gap: 16, alignContent: 'center', minHeight: '70vh', textAlign: 'center' }}>
      <h1>Page not found</h1>
      <Bottom><button className="btn btn-primary btn-wide" onClick={() => go('/')}>Home</button></Bottom>
    </div>
  );
}

export default function App() {
  const state = useProgress();
  const [page, a, b] = useRoute();
  const role = state.active ? roleById.get(state.active) : undefined;

  if (import.meta.env.DEV && page === 'local-audio-test' && LocalSttQa) return <Suspense fallback="Loading test screen…"><LocalSttQa /></Suspense>;
  if (page === 'privacy' || page === 'parents') return <PrivacyPage parents={page === 'parents'} />;

  let screen;
  if (page === 'settings') screen = <SettingsScreen state={state} />;
  else if (!role || page === 'roles') screen = <RolePicker state={state} />;
  else if (!page) screen = <Home state={state} role={role} />;
  else if (page === 'scene' && sceneById.has(a)) screen = <SceneScreen state={state} role={role} scene={sceneById.get(a)!} />;
  else if (page === 'read' && sceneById.has(a)) screen = <ReadScene role={role} scene={sceneById.get(a)!} />;
  else if (page === 'progress') screen = <ProgressScreen state={state} role={role} />;
  else if (page === 'play' && a) screen = <Play key={`${a}-${b}`} role={role} game={a} sceneId={b} />;
  else screen = <NotFound />;

  return <div data-house={role?.house ?? 'neutral'} style={{ minHeight: '100%' }}>{screen}<PrivacyLinks /></div>;
}

