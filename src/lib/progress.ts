// Everything a kid's device remembers. Nothing here leaves the browser.
import { useSyncExternalStore } from 'react';

export type Outcome = 'good' | 'ok' | 'miss';
export type ItemState = { l: number; due: number; miss: number; seen: number; last: Outcome };
export type GameState = { done: number; best?: number };
export type State = {
  v: 1;
  roles: string[];
  active: string | null;
  items: Record<string, ItemState>;
  games: Record<string, GameState>;
  days: Record<string, number>;
  settings: { voice: boolean; rate: number; speechProvider: 'elevenlabs' | 'browser'; showTranscripts: boolean };
};

export const MAX_LEVEL = 5;
/** Days until a line comes back for review, by mastery level. */
export const REVIEW_GAP = [0, 0, 1, 2, 4, 7];

const KEY = 'line-buddy:v1';
const fresh = (): State => ({ v: 1, roles: [], active: null, items: {}, games: {}, days: {}, settings: { voice: true, rate: 1, speechProvider: 'elevenlabs', showTranscripts: false } });

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

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.v === 1) return { ...fresh(), ...s, settings: { ...fresh().settings, ...s.settings } };
    }
  } catch { /* private mode or corrupt data: start fresh */ }
  return fresh();
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

export function record(ids: string[], outcome: Outcome, cap: number) {
  const today = dayNumber();
  const itemsNext = { ...state.items };
  for (const id of ids) itemsNext[id] = applyOutcome(itemsNext[id], outcome, cap, today);
  const k = dayKey(today);
  set({ ...state, items: itemsNext, days: { ...state.days, [k]: (state.days[k] ?? 0) + 1 } });
}

export const gameKey = (role: string, scene: string, game: string) => `${role}|${scene}|${game}`;
export function finishGame(key: string, timeMs?: number) {
  const g = state.games[key] ?? { done: 0 };
  const best = timeMs == null ? g.best : g.best == null ? timeMs : Math.min(g.best, timeMs);
  set({ ...state, games: { ...state.games, [key]: { done: g.done + 1, best } } });
}

export function setSettings(patch: Partial<State['settings']>) {
  set({ ...state, settings: { ...state.settings, ...patch } });
}

export const levelOf = (s: State, id: string) => s.items[id]?.l ?? 0;
export function mastery(s: State, ids: string[]): number {
  if (!ids.length) return 0;
  return ids.reduce((sum, id) => sum + levelOf(s, id), 0) / (ids.length * MAX_LEVEL);
}
export const isTrouble = (it: ItemState | undefined) => !!it && it.l < 4 && (it.miss >= 2 || it.last === 'miss');
export const isDue = (it: ItemState | undefined, today: number) => !!it && it.l < MAX_LEVEL + 1 && it.due <= today;

export function exportData(): string { return JSON.stringify(state, null, 2); }
export function importData(json: string): boolean {
  try {
    const s = JSON.parse(json);
    if (!s || s.v !== 1 || typeof s.items !== 'object') return false;
    set({ ...fresh(), ...s, settings: { ...fresh().settings, ...s.settings } });
    return true;
  } catch { return false; }
}
export function resetAll() { set(fresh()); }
