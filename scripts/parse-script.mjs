// Turns the editable script text + roles file into the data the app loads.
// Pure functions, so the tests can call them directly.

import { createHash } from 'node:crypto';

const HEADING_RE = /^===\s*(PROLOGUE|ACT (\d+), SCENE (\d+))\s*(?::\s*(.+?))?\s*===$/;
const SPEAKER_RE = /^([A-Z][A-Z .#&0-9]*?)(?:\s*\[([^\]]+)\])?:$/;
const DIRECTION_ONLY_RE = /^\[[^\]]*\]$/;

export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const normalise = (s) =>
  s.toLowerCase().replace(/\[[^\]]*\]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * @param {string} text   contents of script/<play>.txt
 * @param {object} config parsed roles.yml: { roles, overrides, scene_titles }, plus optional
 *                        `scenes` from scenes.yml: { [sceneId]: { summary, wants: { [roleName]: text } } }
 */
export function parseScript(text, config) {
  const problems = [];
  const roleByLabel = new Map();
  const roles = (config.roles ?? []).map((r) => {
    const role = { id: slug(r.name), name: r.name, house: r.house ?? 'neutral' };
    for (const label of r.labels ?? []) roleByLabel.set(label, role.id);
    return role;
  });
  const roleIds = new Set(roles.map((r) => r.id));
  const overrides = new Map();
  for (const o of config.overrides ?? []) {
    const id = slug(o.role);
    if (!roleIds.has(id)) problems.push(`roles.yml override names an unknown role: "${o.role}"`);
    overrides.set(`${o.scene}|${o.label}`, id);
  }

  let title = 'Untitled';
  let credit = '';
  const scenes = [];
  let scene = null;
  let speech = null;
  const usedIds = new Map();

  const closeSpeech = () => {
    if (!speech) return;
    // Directions trailing a speech (exits, entrances) belong to the scene, not the speech.
    const trailing = [];
    while (speech.lines.length && DIRECTION_ONLY_RE.test(speech.lines[speech.lines.length - 1])) {
      trailing.unshift(speech.lines.pop());
    }
    if (!speech.lines.some((l) => !DIRECTION_ONLY_RE.test(l))) {
      problems.push(`Speech with no spoken words: ${speech.label} in ${scene.id}`);
    }
    const base = createHash('sha1').update(speech.role + '|' + normalise(speech.lines.join(' '))).digest('hex').slice(0, 8);
    const n = (usedIds.get(base) ?? 0) + 1;
    usedIds.set(base, n);
    speech.id = n === 1 ? base : `${base}-${n}`;
    if (speech.plain.length) speech.plain = speech.plain.join(' ');
    else delete speech.plain;
    if (speech.why.length) speech.why = speech.why.join(' ');
    else delete speech.why;
    if (!speech.note) delete speech.note;
    delete speech.label;
    scene.items.push(speech);
    for (const d of trailing) scene.items.push({ k: 'd', text: d.slice(1, -1).trim() });
    speech = null;
  };

  const rawLines = text.split(/\r?\n/);
  rawLines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    const where = `line ${idx + 1}`;
    if (!line || line.startsWith('#')) return;

    if (!scene && line.startsWith('TITLE:')) { title = line.slice(6).trim(); return; }
    if (!scene && line.startsWith('CREDIT:')) { credit = line.slice(7).trim(); return; }

    const h = line.match(HEADING_RE);
    if (h) {
      closeSpeech();
      const act = h[2] ? Number(h[2]) : 0;
      const num = h[3] ? Number(h[3]) : 0;
      const id = `${act}.${num}`;
      scene = {
        id,
        act,
        scene: num,
        title: h[4] ?? config.scene_titles?.[id] ?? (act ? `Act ${act}, Scene ${num}` : 'Prologue'),
        items: [],
      };
      scenes.push(scene);
      return;
    }
    if (line.startsWith('===')) { problems.push(`${where}: heading not understood: ${line}`); return; }
    if (!scene) { problems.push(`${where}: text before the first scene heading: ${line}`); return; }

    const sp = line.match(SPEAKER_RE);
    if (sp) {
      closeSpeech();
      const label = sp[1].trim();
      const role = overrides.get(`${scene.id}|${label}`) ?? roleByLabel.get(label);
      if (!role) problems.push(`${where}: speaker "${label}" in scene ${scene.id} is not in roles.yml`);
      speech = { k: 's', id: '', role: role ?? slug(label), label, note: sp[2]?.trim(), lines: [], plain: [], why: [] };
      return;
    }

    if (line.startsWith('>')) {
      if (!speech) { problems.push(`${where}: thought-cue line with no speech above it`); return; }
      speech.why.push(line.slice(1).trim());
      return;
    }
    if (line.startsWith('=')) {
      if (!speech) { problems.push(`${where}: plain-English line with no speech above it`); return; }
      speech.plain.push(line.slice(1).trim());
      return;
    }

    if (speech) { speech.lines.push(line); return; }
    if (DIRECTION_ONLY_RE.test(line)) { scene.items.push({ k: 'd', text: line.slice(1, -1).trim() }); return; }
    problems.push(`${where}: words with no speaker above them: ${line.slice(0, 50)}`);
  });
  closeSpeech();

  // Report.
  const counts = new Map(roles.map((r) => [r.id, { speeches: 0, lines: 0, words: 0, scenes: new Set() }]));
  let missingPlain = 0;
  let missingWhy = 0;
  let totalSpeeches = 0;
  for (const sc of scenes) {
    for (const it of sc.items) {
      if (it.k !== 's') continue;
      totalSpeeches++;
      if (!it.plain) missingPlain++;
      if (!it.why) missingWhy++;
      const c = counts.get(it.role);
      if (!c) continue;
      const spoken = it.lines.filter((l) => !DIRECTION_ONLY_RE.test(l));
      c.speeches++;
      c.lines += spoken.length;
      c.words += spoken.join(' ').replace(/\[[^\]]*\]/g, ' ').split(/\s+/).filter(Boolean).length;
      c.scenes.add(sc.id);
    }
  }
  for (const r of roles) {
    const c = counts.get(r.id);
    r.speeches = c.speeches;
    r.lines = c.lines;
    r.words = c.words;
    r.scenes = [...c.scenes];
    if (!c.speeches) problems.push(`Role "${r.name}" has no speeches in the script`);
  }
  // Scene summaries and what each character wants.
  let missingSummary = 0;
  let missingWants = 0;
  for (const sc of scenes) {
    const info = config.scenes?.[sc.id];
    if (info?.summary) sc.summary = String(info.summary).trim();
    else missingSummary++;
    const speaking = new Set(sc.items.filter((i) => i.k === 's').map((i) => i.role));
    const wants = {};
    for (const [name, text] of Object.entries(info?.wants ?? {})) {
      const id = slug(name);
      if (!roleIds.has(id)) problems.push(`scenes.yml ${sc.id}: "${name}" is not a role in roles.yml`);
      else if (!speaking.has(id)) problems.push(`scenes.yml ${sc.id}: ${name} has no lines in this scene`);
      else wants[id] = String(text).trim();
    }
    if (Object.keys(wants).length) sc.wants = wants;
    missingWants += [...speaking].filter((id) => !wants[id]).length;
  }
  for (const id of Object.keys(config.scenes ?? {})) {
    if (!scenes.some((sc) => sc.id === id)) problems.push(`scenes.yml: there is no scene "${id}" in the script`);
  }
  const silentScenes = scenes.filter((s) => !s.items.some((i) => i.k === 's')).map((s) => s.id);

  return {
    script: { title, credit, roles, scenes },
    report: { totalSpeeches, missingPlain, missingWhy, missingSummary, missingWants, silentScenes, problems },
  };
}
