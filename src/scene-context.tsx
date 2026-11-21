import { useEffect, useRef, useState } from 'react';
import { roleName, sceneLabel, type Scene, type Item } from './lib/script';
import { Verse } from './ui';

export type LearningContext = { scene: Scene; roleId: string; inOrder: boolean };

export function SceneOrientation({ scene, roleId }: { scene: Scene; roleId: string }) {
  const characters = [...new Set(scene.items.flatMap(turn => turn.k === 's' ? [roleName(turn.role)] : []))];
  return <section className="scene-orientation" aria-label="Scene orientation">
    <h2>{sceneLabel(scene)} · {scene.title}</h2>
    <dl>
      <div><dt>Where we are in the story</dt><dd>{scene.summary || 'Follow the stage directions and the exchange below to find your place.'}</dd></div>
      <div><dt>Characters in this scene</dt><dd>{characters.join(', ') || 'Stage action only.'}</dd></div>
      {scene.wants?.[roleId] && <div><dt>What you want as {roleName(roleId)}</dt><dd>{scene.wants[roleId]}</dd></div>}
    </dl>
  </section>;
}

export function LearningIntroduction({ scene, roleId, onChoose }: { scene: Scene; roleId: string; onChoose: (inOrder: boolean) => void }) {
  return <>
    <h1>Find your place in the scene</h1>
    <SceneOrientation scene={scene} roleId={roleId} />
    <h2>How would you like to learn?</h2>
    <div className="scene-mode-options">
      <button className="tile" onClick={() => onChoose(true)}><span><b>Learn this scene in order</b><br /><span className="muted">Follow the exchanges between your speeches. More of the script opens as you go.</span></span></button>
      <button className="tile" onClick={() => onChoose(false)}><span><b>Focus on my speeches</b><br /><span className="muted">Work through your questions with nearby dialogue. Expand backward whenever you need more context.</span></span></button>
    </div>
  </>;
}

function ScriptTurns({ scene, from, to, roleId }: { scene: Scene; from: number; to: number; roleId: string }) {
  return <div className="scene-script">
    {scene.items.slice(from, to).map((turn, offset) => turn.k === 'd'
      ? <p className="scene-direction" key={from + offset}><span className="sr-only">Stage direction: </span>{turn.text}</p>
      : <div className={`scene-turn ${turn.role === roleId ? 'scene-turn-mine' : ''}`} key={turn.id}>
          <h3>{roleName(turn.role)}{turn.role === roleId ? ' · you' : ''}</h3>
          {turn.note && <p className="scene-direction">{turn.note}</p>}
          <Verse lines={turn.lines} />
        </div>)}
  </div>;
}

/** Keep whole speech turns intact; never cut a cue at an arbitrary line count. */
function precedingExchange(scene: Scene, index: number, speeches: number) {
  let found = 0;
  for (let at = index - 1; at >= 0; at--) {
    if (scene.items[at].k === 's' && ++found >= speeches) return at;
  }
  return 0;
}

export function SceneContext({ context, item, fromIndex, currentId }: { context: LearningContext; item: Item; fromIndex: number; currentId: string }) {
  const { scene, roleId, inOrder } = context;
  const index = scene.items.findIndex(turn => turn.k === 's' && turn.id === item.speechId);
  const [extraSpeeches, setExtraSpeeches] = useState(0);
  const revealed = useRef<HTMLDivElement>(null);
  // In ordered mode, reveal everything since the last question, including all
  // intervening characters and directions. Future dialogue never enters this tree.
  const start = inOrder ? Math.min(fromIndex, index) : precedingExchange(scene, index, 2 + extraSpeeches);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (inOrder || extraSpeeches > 0) revealed.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
      else window.scrollTo(0, 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [inOrder, item.speechId, extraSpeeches]);
  if (index < 0) return null;
  return <section className="scene-context" aria-label="Script context">
    <details className="scene-reminder"><summary>Scene reminder</summary><SceneOrientation scene={scene} roleId={roleId} /></details>
    <div className="scene-context-heading"><h2>{inOrder ? 'The scene so far' : 'Before you speak'}</h2>
      <button className="btn-plain" onClick={() => { const target = document.getElementById(currentId); target?.scrollIntoView({ block: 'start', behavior: 'auto' }); target?.focus({ preventScroll: true }); }}>Back to my current speech</button>
    </div>
    {inOrder && start > 0 && <details className="earlier-scene"><summary>Earlier in the scene</summary><ScriptTurns scene={scene} from={0} to={start} roleId={roleId} /></details>}
    <div ref={revealed} className="new-exchange">
      <ScriptTurns scene={scene} from={Math.max(0, start)} to={index} roleId={roleId} />
      {index === 0 && <p className="muted">You open this scene.</p>}
      {!inOrder && start > 0 && <button className="btn btn-small" onClick={() => setExtraSpeeches(count => count + 2)}>Show more before this</button>}
    </div>
    <p className="scene-your-turn">Your turn · {roleName(roleId)}</p>
  </section>;
}

export function CompleteScene({ context }: { context: LearningContext }) {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return <section className="complete-scene">
    <h2>The whole scene is now revealed</h2>
    <p className="muted">Read back through everyone’s lines, including what happens after your final speech.</p>
    <details open><summary>Read the whole scene · {sceneLabel(context.scene)}</summary>
      <ScriptTurns scene={context.scene} from={0} to={context.scene.items.length} roleId={context.roleId} />
    </details>
  </section>;
}
