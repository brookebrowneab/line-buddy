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
