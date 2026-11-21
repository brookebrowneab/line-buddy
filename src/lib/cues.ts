import { roleName, sceneById, seeded, speechItems, spokenLines, type Item } from './script';

export type Beat = { who: string; role?: string; speechId?: string; text: string; isCue: boolean };
export type Round = { item: Item; beats: Beat[] };

export function buildCueRounds(roleId: string, sceneId: string): Round[] {
  const scene = sceneById.get(sceneId);
  if (!scene) return [];
  const mine = new Map(speechItems(roleId, sceneId).map((s) => [s.id, s]));
  const rand = seeded(sceneId + roleId + Date.now());
  const rounds: Round[] = [];
  scene.items.forEach((it, i) => {
    if (it.k !== 's' || it.role !== roleId || !mine.has(it.id)) return;
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

