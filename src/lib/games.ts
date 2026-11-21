import { allItems, items, partIds, seeded, shuffle, speechItems, type Item } from './script';
import { dayNumber, isDue, isTrouble, levelOf, type State } from './progress';

export type GameId = 'understand' | 'why' | 'letters' | 'vanish' | 'scramble' | 'cue' | 'sayit' | 'partner' | 'speed';
export type Game = { id: GameId; name: string; blurb: string; icon: string; cap: number };

/** In path order: easy at the top, off-book at the bottom. `cap` is the highest mastery level a game can prove. */
export const GAMES: Game[] = [
  { id: 'understand', name: 'Understand', blurb: 'Read your lines next to plain English', icon: '💡', cap: 1 },
  { id: 'why', name: 'Thought Cues', blurb: 'What makes you say each line?', icon: '💭', cap: 2 },
  { id: 'letters', name: 'First Letters', blurb: 'Only the first letter of each word', icon: '🔤', cap: 2 },
  { id: 'vanish', name: 'Vanishing Words', blurb: 'Fill the gaps. More vanish each time', icon: '🫥', cap: 3 },
  { id: 'scramble', name: 'Scramble', blurb: 'Put the pieces back in order', icon: '🧩', cap: 3 },
  { id: 'cue', name: 'Cue Catch', blurb: 'Spot the moment it is your turn', icon: '🎯', cap: 4 },
  { id: 'sayit', name: 'Say It', blurb: 'Hear the cue, say the line, check', icon: '🎤', cap: 5 },
  { id: 'partner', name: 'Scene Partner', blurb: 'Run the scene with the other voices', icon: '🎭', cap: 5 },
  { id: 'speed', name: 'Speed Run', blurb: 'Every cue, against the clock', icon: '⚡', cap: 5 },
];
export const gameById = new Map(GAMES.map((g) => [g.id, g]));

export type StepKind = 'understand' | 'match' | 'why' | 'letters' | 'vanish' | 'scramble' | 'sayit';
export type Step = { kind: StepKind; item: Item; ids: string[]; cap: number; blankShare?: number; options?: Item[]; again?: boolean; thoughtOnly?: boolean; wholeSpeech?: boolean };

export const BATCH = 8;

/** The lines that need this game most: lowest mastery first, kept in script order. */
export function pickBatch(state: State, list: Item[], size = BATCH, level: (it: Item) => number = (it) => levelOf(state, it.id)): Item[] {
  if (list.length <= size) return list;
  const order = new Map(list.map((it, i) => [it.id, i]));
  return [...list]
    .sort((a, b) => level(a) - level(b) || order.get(a.id)! - order.get(b.id)!)
    .slice(0, size)
    .sort((a, b) => order.get(a.id)! - order.get(b.id)!);
}

/** How well a whole speech is known: its weakest part. */
export const speechLevel = (state: State, sp: Item) => Math.min(...partIds(sp).map((id) => levelOf(state, id)));
export const pickSpeeches = (state: State, roleId: string, sceneId: string, size = BATCH) =>
  pickBatch(state, speechItems(roleId, sceneId), size, (sp) => speechLevel(state, sp));

const blankShare = (level: number) => (level <= 0 ? 0.3 : level === 1 ? 0.5 : 0.75);

export function buildSteps(state: State, game: GameId, roleId: string, sceneId: string, size: 'parts' | 'whole' = 'parts'): Step[] {
  const cap = gameById.get(game)!.cap;
  if (game === 'understand') {
    const batch = speechItems(roleId, sceneId);
    const steps: Step[] = batch.map((item) => ({ kind: 'understand', item, ids: partIds(item), cap }));
    const withPlain = batch.filter((s) => s.plain);
    if (withPlain.length >= 3) {
      const rand = seeded(sceneId + roleId + dayNumber());
      for (const item of shuffle(withPlain, rand).slice(0, 5)) {
        const others = shuffle(withPlain.filter((o) => o.id !== item.id), rand).slice(0, 2);
        steps.push({ kind: 'match', item, ids: partIds(item), cap, options: shuffle([item, ...others], rand) });
      }
    }
    return steps;
  }
  if (game === 'why') {
    // Keep this a reading/context game, even when a role has only one speech.
    const all = speechItems(roleId, sceneId).filter((s) => s.why);
    const batch = speechItems(roleId, sceneId).filter((s) => s.why);
    const rand = seeded(sceneId + roleId + 'why' + dayNumber());
    return batch.map((item): Step => {
      const others = shuffle(all.filter((o) => o.id !== item.id && o.lines[0] !== item.lines[0]), rand).slice(0, 2);
      return { kind: 'why', item, ids: partIds(item), cap, options: shuffle([item, ...others], rand) };
    });
  }
  // Explicit scene practice includes every part so skipping can reach any speech.
  // Today's practice and trouble practice retain their short batches.
  const batch = size === 'whole' ? speechItems(roleId, sceneId) : items(roleId, sceneId);
  const idsFor = (item: Item) => size === 'whole' ? partIds(item) : [item.id];
  const levelFor = (item: Item) => size === 'whole' ? speechLevel(state, item) : levelOf(state, item.id);
  if (game === 'vanish') {
    const first: Step[] = batch.map((item) => ({ kind: 'vanish', item, ids: idsFor(item), cap, wholeSpeech: size === 'whole', blankShare: blankShare(levelFor(item)) }));
    // Short scenes get a second, harder pass straight away.
    const second: Step[] = batch.length <= 4
      ? batch.map((item) => ({ kind: 'vanish', item, ids: idsFor(item), cap, wholeSpeech: size === 'whole', blankShare: Math.min(0.9, blankShare(levelFor(item)) + 0.25) }))
      : [];
    return [...first, ...second];
  }
  return batch.map((item) => ({ kind: game as StepKind, item, ids: idsFor(item), cap, wholeSpeech: size === 'whole' }));
}

/** Pick the right kind of practice for how well a line is known. */
function stepForLevel(state: State, item: Item): Step {
  const l = levelOf(state, item.id);
  if (l <= 0) return { kind: 'letters', item, ids: [item.id], cap: 2 };
  if (l === 1) return { kind: 'vanish', item, ids: [item.id], cap: 3, blankShare: 0.5 };
  if (l === 2) return { kind: 'scramble', item, ids: [item.id], cap: 3 };
  return { kind: 'sayit', item, ids: [item.id], cap: 5 };
}

export function troubleItems(state: State, roleId: string): Item[] {
  return allItems(roleId).filter((it) => isTrouble(state.items[it.id]));
}
export function dueItems(state: State, roleId: string): Item[] {
  const today = dayNumber();
  return allItems(roleId).filter((it) => isDue(state.items[it.id], today) && levelOf(state, it.id) < 5);
}

/** "Today's practice": a short mix of lines due for review, then new ones. */
export function todaySteps(state: State, roleId: string, size = BATCH): Step[] {
  const all = allItems(roleId);
  const trouble = all.filter((it) => isTrouble(state.items[it.id]));
  const due = dueItems(state, roleId).sort((a, b) => levelOf(state, a.id) - levelOf(state, b.id));
  const fresh = all.filter((it) => !state.items[it.id]);
  const picked: Item[] = [];
  for (const it of [...trouble, ...due, ...fresh]) {
    if (picked.length >= size) break;
    if (!picked.includes(it)) picked.push(it);
  }
  return picked.map((it) => stepForLevel(state, it));
}
export function troubleSteps(state: State, roleId: string): Step[] {
  return troubleItems(state, roleId).slice(0, BATCH).map((item) => ({ kind: 'sayit', item, ids: [item.id], cap: 5 }));
}
