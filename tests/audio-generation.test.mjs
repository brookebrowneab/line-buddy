import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildAudioPlan, cueStart, generate } from '../scripts/generate-audio.mjs';
import script from '../src/data/script.json';
describe('batch character recordings', () => {
  it('plans one clean recording per existing app speech with stable filenames', () => {
    const voices = Object.fromEntries(script.roles.map(role => [role.id, { voice_id: role.id + '-voice' }]));
    const jobs = buildAudioPlan(script, voices);
    expect(jobs).toHaveLength(361); expect(new Set(jobs.map(j => j.src)).size).toBe(361);
    expect(jobs.every(j => !j.text.includes('[') && j.payload.model_id === 'eleven_v3')).toBe(true);
    expect(buildAudioPlan(script, voices)).toEqual(jobs);
    const changed = structuredClone(voices); changed.romeo.voice_id = 'new';
    expect(buildAudioPlan(script, changed).find(j => j.role === 'romeo').fingerprint).not.toBe(jobs.find(j => j.role === 'romeo').fingerprint);
  });
  it('uses provider timing for exact cue starts and refuses mismatched alignment', () => {
    expect(cueStart('one two', 'two', { characters: [...'one two'], character_start_times_seconds: [0,.1,.2,.3,1,1.1,1.2] })).toBe(.96);
    expect(cueStart('one two', 'two', { characters: ['wrong'] })).toBe(-1);
    expect(cueStart('one two', 'one two', null)).toBe(0);
  });
  it('publishes audio atomically, resumes without another paid request, and keeps receipts private', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'lines-audio-'));
    try {
      await mkdir(path.join(root, 'src/data'), { recursive: true }); await mkdir(path.join(root, 'config'));
      await writeFile(path.join(root, 'src/data/script.json'), JSON.stringify({ scenes: [{ act: 1, scene: 1, id: '1.1', items: [{ k: 's', id: 'speech1', role: 'romeo', lines: ['But soft.'] }] }] }));
      await writeFile(path.join(root, 'config/tts-voices.json'), JSON.stringify({ romeo: { voice_id: 'voice1' } }));
      let calls = 0;
      const options = { root, generate: true, key: 'not-real', fetchImpl: async () => { calls++; return Response.json({ audio_base64: Buffer.from('ID3test').toString('base64') }); } };
      await generate(options); const result = await generate(options);
      expect(calls).toBe(1); expect(result.pending).toHaveLength(0);
      const data = JSON.parse(await readFile(path.join(root, 'src/data/recordings.json'), 'utf8'));
      expect((await readFile(path.join(root, 'public', data.clips.speech1.src))).toString()).toBe('ID3test');
      expect((await readFile(path.join(root, 'src/data/recordings.json'), 'utf8'))).not.toContain('not-real');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
