#!/usr/bin/env node
// One-time bootstrap: turn a script PDF into the editable text file.
//
//   node scripts/import-pdf.mjs "<path to script.pdf>" script/romeo-and-juliet.txt [--force]
//
// Expects the "DEAL" layout: `SPEAKER:` on its own line, stage directions in
// [square brackets], `ACT I` / `[SCENE 1.]` headings, one verse line per line.
// After this runs once, the .txt file is the source of truth. Edit it by hand.

import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';

const [pdfPath, outPath, ...flags] = process.argv.slice(2);
if (!pdfPath || !outPath) {
  console.error('Usage: node scripts/import-pdf.mjs <script.pdf> <out.txt> [--force]');
  process.exit(1);
}
if (existsSync(outPath) && !flags.includes('--force')) {
  console.error(`${outPath} already exists. It may contain hand edits and paraphrases.\nRe-run with --force to overwrite it.`);
  process.exit(1);
}

const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7 };
const ACT_RE = /^\[?ACT ([IVX]+)\.?\]?$/;
const SCENE_RE = /^\[SCENE (\d+)\.?\s*\]$/;
// SPEAKER:   SPEAKER: [aside]   SPEAKER [offstage]:   SERVANT #2:
const SPEAKER_RE = /^([A-Z][A-Z .#&0-9]*?)\s*(?:\[([^\]]+)\])?\s*:\s*(?:\[([^\]]+)\])?$/;
const BARE_LABEL_RE = /^[A-Z][A-Z .#&0-9]+$/;

const raw = execFileSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const lines = raw
  .replace(/\f/g, '')
  .replace(/​/g, '')
  .split('\n')
  .map((l) => ({ text: l.trim().replace(/\s+/g, ' '), width: l.replace(/\s+$/, '').length }));

// Pass 1: learn the speaker labels (those written with a colon), so that the
// few labels typed without a colon ("MERCUTIO") are still recognised.
const knownLabels = new Set();
for (const { text } of lines) {
  const m = text.match(SPEAKER_RE);
  if (m) knownLabels.add(m[1].trim());
}

const isDirectionOnly = (t) => /^\[[^\]]*\]$/.test(t);

// Pass 2: build the document.
const out = [];
const warnings = [];
let titleLines = [];
let started = false; // true once we are past the title block
let speechOpen = false;
let act = 0;
let prevSpoken = null; // previous spoken line of the open speech, for prose re-joining
let i = 0;

const blank = () => { if (out.length && out[out.length - 1] !== '') out.push(''); };
const openSpeech = (label, note) => {
  blank();
  out.push(note ? `${label} [${note}]:` : `${label}:`);
  speechOpen = true;
  prevSpoken = null;
};

while (i < lines.length) {
  let { text, width } = lines[i];
  i++;
  if (!text) continue;

  if (!started) {
    if (text.startsWith('[') || ACT_RE.test(text)) {
      started = true;
      out.push(`TITLE: ${titleLines[0] ?? 'Untitled'}`);
      if (titleLines.length > 1) out.push(`CREDIT: ${titleLines.slice(1).join(' ')}`);
      if (!ACT_RE.test(text)) { blank(); out.push('=== PROLOGUE ==='); }
    } else {
      titleLines.push(text);
      continue;
    }
  }

  // A direction that wraps onto following lines: keep reading until it closes.
  if (text.startsWith('[') && !text.includes(']')) {
    while (i < lines.length && !text.includes(']')) {
      if (lines[i].text) text += ' ' + lines[i].text;
      i++;
    }
  }

  const actM = text.match(ACT_RE);
  if (actM) { act = ROMAN[actM[1]] ?? 0; speechOpen = false; continue; }

  const sceneM = text.match(SCENE_RE);
  if (sceneM) {
    blank();
    out.push(`=== ACT ${act}, SCENE ${sceneM[1]} ===`);
    speechOpen = false;
    continue;
  }

  const spM = text.match(SPEAKER_RE);
  if (spM && spM[1].trim().length > 1) {
    openSpeech(spM[1].trim(), (spM[2] || spM[3] || '').trim());
    continue;
  }
  if (BARE_LABEL_RE.test(text) && knownLabels.has(text)) {
    openSpeech(text, '');
    warnings.push(`Label without a colon treated as a speaker: "${text}"`);
    continue;
  }

  if (isDirectionOnly(text)) {
    const dir = '[' + text.slice(1, -1).trim() + ']';
    if (/^\[End of Play\.?\]$/i.test(dir)) continue;
    // Entrances/exits between speeches read better on their own; a direction
    // in the middle of a speech stays inside it.
    out.push(dir);
    prevSpoken = null;
    continue;
  }

  // Spoken text.
  if (!speechOpen) {
    // Unlabelled speech (the Prologue): the script only does this for the Chorus.
    openSpeech('CHORUS', '');
    warnings.push(`Unlabelled speech given to CHORUS: "${text.slice(0, 40)}…"`);
  }
  const spoken = text.replace(/\[\s*([^\]]*?)\s*\]/g, '[$1]').replace(/^\((offstage)\)\s*/i, '[$1] ');
  // Prose (and the odd over-long verse line) is hard-wrapped by the page layout.
  // Re-join when the previous line ran to the margin or this one starts lower-case.
  const continues = prevSpoken && (prevSpoken.width >= 78 || /^[a-z]/.test(spoken));
  if (continues) {
    out[prevSpoken.index] += ' ' + spoken;
  } else {
    out.push(spoken);
    prevSpoken = { index: out.length - 1 };
  }
  prevSpoken.width = width;
}

writeFileSync(outPath, out.join('\n') + '\n');
const speeches = out.filter((l) => /^[A-Z][A-Z .#&0-9]*(\s\[[^\]]+\])?:$/.test(l)).length;
const scenes = out.filter((l) => l.startsWith('===')).length;
console.log(`Wrote ${outPath}: ${scenes} scenes, ${speeches} speeches, ${knownLabels.size} speaker labels.`);
for (const w of warnings) console.log('  note: ' + w);
