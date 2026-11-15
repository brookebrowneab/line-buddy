import data from '../data/script.json';

export type House = 'montague' | 'capulet' | 'neutral';
export type Role = { id: string; name: string; house: House; speeches: number; lines: number; words: number; scenes: string[] };
export type Speech = { k: 's'; id: string; role: string; note?: string; lines: string[]; plain?: string; why?: string };
export type Direction = { k: 'd'; text: string };
export type Scene = { id: string; act: number; scene: number; title: string; summary?: string; wants?: Record<string, string>; items: (Speech | Direction)[] };
export type Script = { title: string; credit: string; roles: Role[]; scenes: Scene[] };

export const script = data as unknown as Script;
export const roleById = new Map(script.roles.map((r) => [r.id, r]));
export const sceneById = new Map(script.scenes.map((s) => [s.id, s]));
export const roleName = (id: string) => roleById.get(id)?.name ?? id;
export const sceneLabel = (s: Scene) => (s.act ? `Act ${s.act}, Scene ${s.scene}` : 'Prologue');

const DIRECTION_ONLY = /^\[[^\]]*\]$/;

/** The words actually said: stage directions removed. */
export function spokenLines(lines: string[]): string[] {
  return lines
    .filter((l) => !DIRECTION_ONLY.test(l))
    .map((l) => l.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Break a speech into bite-sized parts so long speeches are learned a few lines at a time. */
export function chunkLines(lines: string[], maxUnits = 4, maxWords = 36): string[][] {
  const units: string[] = [];
  for (const line of lines) {
    if (wordCount(line) <= 22) { units.push(line); continue; }
    // Long prose: split into sentences, then pack sentences into ~18-word units.
    let cur = '';
    for (const sentence of line.split(/(?<=[.!?…])\s+/)) {
      if (cur && wordCount(cur) + wordCount(sentence) > 18) { units.push(cur); cur = sentence; }
      else cur = cur ? `${cur} ${sentence}` : sentence;
    }
    if (cur) units.push(cur);
  }
  const chunks: string[][] = [];
  let cur: string[] = [];
  let words = 0;
  for (const u of units) {
    const w = wordCount(u);
    if (cur.length && (cur.length >= maxUnits || words + w > maxWords)) { chunks.push(cur); cur = []; words = 0; }
    cur.push(u);
    words += w;
  }
  if (cur.length) chunks.push(cur);
  // Don't leave a lonely last line.
  if (chunks.length > 1 && chunks[chunks.length - 1].length === 1 && wordCount(chunks[chunks.length - 1][0]) < 8) {
    const last = chunks.pop()!;
    chunks[chunks.length - 1].push(...last);
  }
  return chunks;
}

/** `plain` is the meaning of the cue speech, when that speech is short enough to be worth showing. */
export type Cue = { who: string; text: string; self?: boolean; plain?: string } | null;

/** One thing to learn: a speech, or one part of a long speech. */
export type Item = {
  id: string; // `${speechId}:${part}`
  speechId: string;
  sceneId: string;
  role: string;
  part: number;
  parts: number;
  lines: string[];
  cue: Cue;
  plain?: string;
  /** Thought cue: what has just happened that makes this character speak. */
  why?: string;
  note?: string;
};

const lastLines = (lines: string[], n: number) => lines.slice(-n).join(' ');

/** The cue for a speech: the end of the nearest earlier speech by someone else. */
export function cueFor(scene: Scene, index: number): Cue {
  const me = scene.items[index] as Speech;
  for (let i = index - 1; i >= 0; i--) {
    const it = scene.items[i];
    if (it.k === 's' && it.role !== me.role) {
      const sp = spokenLines(it.lines);
      if (sp.length) return { who: roleName(it.role), text: lastLines(sp, 2), plain: sp.length <= 4 ? it.plain : undefined };
    }
  }
  for (let i = index - 1; i >= 0; i--) {
    const it = scene.items[i];
    if (it.k === 'd') return { who: 'Stage', text: it.text };
  }
  return null;
}

/** Whole speeches for a role in a scene (used by scene-run games). */
export function speechItems(roleId: string, sceneId: string): Item[] {
  const scene = sceneById.get(sceneId);
  if (!scene) return [];
  const out: Item[] = [];
  scene.items.forEach((it, i) => {
    if (it.k !== 's' || it.role !== roleId) return;
    const lines = spokenLines(it.lines);
    if (!lines.length) return;
    out.push({ id: it.id, speechId: it.id, sceneId, role: roleId, part: 0, parts: 1, lines, cue: cueFor(scene, i), plain: it.plain, why: it.why, note: it.note });
  });
  return out;
}

/** Bite-sized parts for a role in a scene (used by the word games and progress). */
export function items(roleId: string, sceneId: string): Item[] {
  const out: Item[] = [];
  for (const sp of speechItems(roleId, sceneId)) {
    const chunks = chunkLines(sp.lines);
    chunks.forEach((lines, part) => {
      out.push({
        ...sp,
        id: `${sp.speechId}:${part}`,
        part,
        parts: chunks.length,
        lines,
        cue: part === 0 ? sp.cue : { who: 'You', text: lastLines(chunks[part - 1], 1), self: true },
      });
    });
  }
  return out;
}

export const partIds = (speech: Item): string[] =>
  chunkLines(speech.lines).map((_, i) => `${speech.speechId}:${i}`);

export function allItems(roleId: string): Item[] {
  const role = roleById.get(roleId);
  return role ? role.scenes.flatMap((s) => items(roleId, s)) : [];
}

export type Token = { lead: string; core: string; trail: string };
/** Split a line into words, keeping punctuation separate from the letters. */
export function tokens(line: string): Token[] {
  return line.split(/\s+/).filter(Boolean).map((w) => {
    const m = w.match(/^([^A-Za-z0-9]*)(.*?)([^A-Za-z0-9]*)$/)!;
    return { lead: m[1], core: m[2], trail: m[3] };
  });
}

/** Small deterministic random generator so a game looks the same if re-opened. */
export function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h += 0x6d2b79f5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
