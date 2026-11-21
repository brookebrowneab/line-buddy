// Everything a kid's device remembers. Nothing here leaves the browser.
import { useSyncExternalStore } from 'react';

export type Outcome = 'good' | 'ok' | 'miss';
export type ItemState = { l: number; due: number; miss: number; seen: number; last: Outcome };
export type CueState = { seen: number; caught: number; miss: number; last: Outcome; mode: 'read' | 'listen' };
export type GameState = { done: number; best?: number };
export type State = {
  v: 2;
  roles: string[];
  active: string | null;
  wordItems: Record<string, ItemState>;
  cues: Record<string, CueState>;
  games: Record<string, GameState>;
  days: Record<string, number>;
  settings: { microphone: boolean; voice: boolean; rate: number; speechProvider: 'local'; showTranscripts: boolean };
};

export const MAX_LEVEL = 5;
/** Days until a line comes back for review, by mastery level. */
export const REVIEW_GAP = [0, 0, 1, 2, 4, 7];

const KEY = 'line-buddy:v2';
const LEGACY_KEY = 'line-buddy:v1';
const fresh = (): State => ({ v: 2, roles: [], active: null, wordItems: {}, cues: {}, games: {}, days: {}, settings: { microphone: false, voice: true, rate: 1, speechProvider: 'local', showTranscripts: false } });

export const dayNumber = (d = new Date()) => Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
export const dayKey = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10);

/** Pure rule for how one result changes a line's mastery. `cap` is the highest level this game can prove. */
export function applyOutcome(prev: ItemState | undefined, outcome: Outcome, cap: number, today: number): ItemState {
  const p = prev ?? { l: 0, due: today, miss: 0, seen: 0, last: outcome };
  let l = p.l;
  if (outcome === 'good' && l < cap) l = Math.min(MAX_LEVEL, l + 1);
  if (outcome === 'ok' && l === 0) l = 1; // a first near-miss still counts as a start
  if (outcome === 'miss') l = Math.max(0, l - 1);
  return {
    l,
    due: today + (outcome === 'miss' ? 0 : REVIEW_GAP[l]),
    miss: outcome === 'miss' ? p.miss + 1 : outcome === 'good' ? Math.max(0, p.miss - 1) : p.miss,
    seen: p.seen + 1,
    last: outcome,
  };
}

export function streak(days: Record<string, number>, today: number): number {
  let n = 0;
  // A streak survives until the end of today: start from today if practised, else yesterday.
  let d = days[dayKey(today)] ? today : today - 1;
  while (days[dayKey(d)]) { n++; d--; }
  return n;
}

const recordLike = (value: unknown) => !!value && typeof value === 'object' && !Array.isArray(value);
function preferences(value: unknown): Pick<State, 'roles' | 'active' | 'settings'> {
  const s = (recordLike(value) ? value : {}) as Partial<State>;
  return {
    roles: Array.isArray(s.roles) ? s.roles.filter(id => typeof id === 'string') : [],
    active: typeof s.active === 'string' ? s.active : null,
    settings: { ...fresh().settings, ...(recordLike(s.settings) ? s.settings : {}), speechProvider: 'local' },
  };
}
function hydrate(value: unknown): State | null {
  if (!recordLike(value)) return null;
  const s = value as Partial<State>;
  if (s.v !== 2 || !recordLike(s.wordItems)) return null;
  if ([s.cues, s.games, s.days].some(track => track !== undefined && !recordLike(track))) return null;
  return { ...fresh(), ...preferences(s), wordItems: s.wordItems!, cues: s.cues ?? {}, games: s.games ?? {}, days: s.days ?? {} };
}
function load(): State {
  try {
    const current = localStorage.getItem(KEY);
    if (current) {
      const saved = hydrate(JSON.parse(current));
      if (saved) {
        try { localStorage.removeItem(LEGACY_KEY); } catch { /* storage blocked */ }
        return saved;
      }
    }
    const legacy = localStorage.getItem(LEGACY_KEY);
    const previous = legacy ? JSON.parse(legacy) : null;
    // This rollout starts testers over once. Keep configuration, discard all
    // old practice results, and isolate new progress from still-open old tabs.
    const next = previous?.v === 1 ? { ...fresh(), ...preferences(previous) } : fresh();
    try { localStorage.setItem(KEY, JSON.stringify(next)); localStorage.removeItem(LEGACY_KEY); } catch { /* storage blocked */ }
    return next;
  } catch { return fresh(); }
}

let state: State = typeof localStorage === 'undefined' ? fresh() : load();
const listeners = new Set<() => void>();
function set(next: State) {
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full or blocked */ }
  listeners.forEach((l) => l());
}

export const getState = () => state;
export function useProgress(): State {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, getState);
}

export function chooseRole(id: string) {
  set({ ...state, active: id, roles: state.roles.includes(id) ? state.roles : [...state.roles, id] });
}
export function removeRole(id: string) {
  const roles = state.roles.filter((r) => r !== id);
  set({ ...state, roles, active: state.active === id ? roles[0] ?? null : state.active });
}

function withActivity(next: State): State {
  const day = dayKey(dayNumber());
  return { ...next, days: { ...next.days, [day]: (next.days[day] ?? 0) + 1 } };
}
export function recordStudy() { set(withActivity(state)); }
/** Only word-checking games write this track. Context-only activity uses cap 0. */
export function record(ids: string[], outcome: Outcome, cap: number) {
  if (cap <= 0) { recordStudy(); return; }
  const today = dayNumber(), wordItems = { ...state.wordItems };
  for (const id of ids) wordItems[id] = applyOutcome(wordItems[id], outcome, cap, today);
  set(withActivity({ ...state, wordItems }));
}
export function recordCue(speechId: string, outcome: Outcome, mode: CueState['mode']) {
  const previous = state.cues[speechId];
  const result: CueState = {
    seen: (previous?.seen ?? 0) + 1,
    caught: (previous?.caught ?? 0) + (outcome === 'miss' ? 0 : 1),
    miss: (previous?.miss ?? 0) + (outcome === 'miss' ? 1 : 0),
    last: outcome, mode,
  };
  set(withActivity({ ...state, cues: { ...state.cues, [speechId]: result } }));
}
export function cueSummary(s: State, speechIds: string[]) {
  const ids = [...new Set(speechIds)];
  return { total: ids.length, tried: ids.filter(id => s.cues[id]?.seen).length,
    caught: ids.filter(id => s.cues[id] && s.cues[id].last !== 'miss').length };
}

// Full-speech Speed Run records are a different challenge from the old excerpts.
// Keep the timing key distinct from the old, shorter challenge.
export const gameKey = (role: string, scene: string, game: string) => `${role}|${scene}|${game === 'speed' ? 'speed-whole-v1' : game}`;
export function finishGame(key: string, timeMs?: number) {
  const g = state.games[key] ?? { done: 0 };
  const best = timeMs == null ? g.best : g.best == null ? timeMs : Math.min(g.best, timeMs);
  set({ ...state, games: { ...state.games, [key]: { done: g.done + 1, best } } });
}

export function setSettings(patch: Partial<State['settings']>) {
  set({ ...state, settings: { ...state.settings, ...patch } });
}

export const levelOf = (s: State, id: string) => s.wordItems[id]?.l ?? 0;
export function mastery(s: State, ids: string[]): number {
  if (!ids.length) return 0;
  return ids.reduce((sum, id) => sum + levelOf(s, id), 0) / (ids.length * MAX_LEVEL);
}
export const isTrouble = (it: ItemState | undefined) => !!it && it.l < 4 && (it.miss >= 2 || it.last === 'miss');
export const isDue = (it: ItemState | undefined, today: number) => !!it && it.l < MAX_LEVEL + 1 && it.due <= today;

export function exportData(): string { return JSON.stringify(state, null, 2); }
export function importData(json: string): boolean {
  try {
    const next = hydrate(JSON.parse(json));
    if (!next) return false;
    set(next);
    return true;
  } catch { return false; }
}
export function resetAll() { set(fresh()); }
