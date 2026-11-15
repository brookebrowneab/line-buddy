#!/usr/bin/env node
// script/<play>.txt + script/roles.yml  ->  src/data/script.json  (+ a check report)
//
//   npm run script

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { parseScript } from './parse-script.mjs';

const TXT = 'script/romeo-and-juliet.txt';
const ROLES = 'script/roles.yml';
const SCENES = 'script/scenes.yml';
const OUT = 'src/data/script.json';

const config = parseYaml(readFileSync(ROLES, 'utf8'));
if (existsSync(SCENES)) config.scenes = parseYaml(readFileSync(SCENES, 'utf8')) ?? {};
const { script, report } = parseScript(readFileSync(TXT, 'utf8'), config);

console.log(`\n${script.title}: ${script.scenes.length} scenes, ${report.totalSpeeches} speeches\n`);
console.log('Role              Speeches  Lines  Words  Scenes');
for (const r of [...script.roles].sort((a, b) => b.words - a.words)) {
  console.log(`${r.name.padEnd(18)}${String(r.speeches).padStart(7)}${String(r.lines).padStart(7)}${String(r.words).padStart(7)}${String(r.scenes.length).padStart(8)}`);
}
if (report.silentScenes.length) console.log(`\nScenes with no speeches (stage action only): ${report.silentScenes.join(', ')}`);
console.log(`\nSpeeches still missing a plain-English line: ${report.missingPlain}`);
console.log(`Speeches still missing a thought cue: ${report.missingWhy}`);
console.log(`Scenes still missing a summary: ${report.missingSummary}`);
console.log(`Characters still missing a "wants" line for a scene: ${report.missingWants}`);

if (report.problems.length) {
  console.error(`\n${report.problems.length} problem(s) to fix in ${TXT}, ${ROLES} or ${SCENES}:`);
  for (const p of report.problems) console.error('  - ' + p);
  process.exit(1);
}

mkdirSync('src/data', { recursive: true });
writeFileSync(OUT, JSON.stringify(script));
console.log(`\nWrote ${OUT}. No problems found.`);
