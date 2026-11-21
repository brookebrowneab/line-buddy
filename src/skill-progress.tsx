import { useMemo } from 'react';
import { buildCueRounds } from './lib/cues';
import { roleById } from './lib/script';
import { cueSummary, type State } from './lib/progress';

export function CueProgress({ state, roleId, sceneId }: { state: State; roleId: string; sceneId?: string }) {
  const ids = useMemo(() => (sceneId ? [sceneId] : roleById.get(roleId)?.scenes ?? [])
    .flatMap(id => buildCueRounds(roleId, id).map(round => round.item.speechId)), [roleId, sceneId]);
  const summary = cueSummary(state, ids);
  return <section className="skill-progress" aria-label="Cue recognition">
    <h2>Cue recognition</h2>
    {summary.total ? <>
      <p><b>{summary.caught} of {summary.total} cues caught</b> · {summary.tried} tried</p>
      <p className="muted">Latest result for each cue. This tracks when to speak; word memorization has its own score.</p>
    </> : <p className="muted">No cues to catch in this set. You may open the scene yourself.</p>}
  </section>;
}

export function EarlierProgress({ state, brief = false }: { state: State; brief?: boolean }) {
  const count = Object.keys(state.items).length;
  if (!count) return null;
  if (brief) return <p className="muted earlier-progress-note">Word and cue scores now use separate checks. Your earlier practice is saved in <a href="#/progress">My progress</a>.</p>;
  return <details className="earlier-progress">
    <summary>Earlier practice history · {count} {count === 1 ? 'part' : 'parts'}</summary>
    <p>Earlier scores combined word checks, cue games and reading. We kept that history, completed games and your streak. New word and cue scores use their own checks, so neither guesses what the older mixed score proved.</p>
    <p>The earlier results are included when you save progress to a file.</p>
  </details>;
}
