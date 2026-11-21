// Generate approved script text once, then serve MP3s as ordinary static assets.
import { readFile, writeFile, mkdir, rename, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
export const spoken = lines => lines.filter(l => !/^\[[^\]]*\]$/.test(l)).map(l => l.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
export function buildAudioPlan(script, voices) {
  const plan = [];
  for (const scene of script.scenes) {
    let order = 0;
    for (const speech of scene.items) {
      if (speech.k !== 's') continue;
      const lines = spoken(speech.lines); if (!lines.length) continue;
      const text = lines.join(' '), cueText = lines.slice(-2).join(' ');
      const voice = voices[speech.role];
      const payload = { text, model_id: 'eleven_v3', voice_settings: { stability: 0.5, similarity_boost: 0.75 } };
      const fingerprint = createHash('sha256').update(JSON.stringify({ voice: voice?.voice_id ?? '', payload, format: 'mp3_44100_128' })).digest('hex');
      const filename = `a${String(scene.act).padStart(2, '0')}_s${String(scene.scene).padStart(2, '0')}_${String(++order).padStart(3, '0')}_${speech.role}_${speech.id}_${fingerprint.slice(0, 10)}.mp3`;
      plan.push({ id: speech.id, scene: scene.id, role: speech.role, voice_id: voice?.voice_id ?? '', text, cueText, payload, fingerprint, src: 'audio/speeches/' + filename });
    }
  }
  return plan;
}
export function cueStart(text, cueText, alignment) {
  if (text === cueText) return 0;
  if (!alignment || alignment.characters?.join('') !== text) return -1;
  const index = text.lastIndexOf(cueText); if (index < 0) return -1;
  const charIndex = Array.from(text.slice(0, index)).length;
  const time = alignment.character_start_times_seconds?.[charIndex];
  return typeof time === 'number' && Number.isFinite(time) ? Math.max(0, time - 0.04) : -1;
}
async function readJson(file, fallback) { try { return JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT' && fallback !== undefined) return fallback; throw error; } }
async function atomicJson(file, data) { const tmp = file + '.tmp'; await writeFile(tmp, JSON.stringify(data, null, 2) + '\n'); await rename(tmp, file); }
export async function generate({ root, generate = false, limit = undefined, onlyId = undefined, excludeRoles = [], concurrency = 2, fetchImpl = fetch, key = process.env.ELEVENLABS_API_KEY }) {
  const script = await readJson(path.join(root, 'src/data/script.json'));
  const voices = await readJson(path.join(root, 'config/tts-voices.json'), {});
  const plan = buildAudioPlan(script, voices);
  const manifestFile = path.join(root, 'src/data/recordings.json');
  const manifest = await readJson(manifestFile, { version: 1, model: 'eleven_v3', clips: {} });
  // Drop stale entries: changed text must never keep playing an outdated recording.
  const valid = new Map(plan.map(job => [job.id, job.fingerprint]));
  for (const [id, clip] of Object.entries(manifest.clips)) if (valid.get(id) !== clip.fingerprint) delete manifest.clips[id];
  const pending = [];
  for (const job of plan) {
    if ((onlyId && job.id !== onlyId) || excludeRoles.includes(job.role)) continue;
    const saved = manifest.clips[job.id];
    if (saved?.fingerprint === job.fingerprint && (await stat(path.join(root, 'public', saved.src)).catch(() => null))?.size) continue;
    pending.push(job);
  }
  if (onlyId && !plan.some(job => job.id === onlyId)) throw new Error('No such speech ID: ' + onlyId);
  const jobs = limit ? pending.slice(0, limit) : pending;
  console.log(`${plan.length} speeches in play; ${jobs.length} pending selected; ${jobs.reduce((n,j) => n + j.text.length, 0).toLocaleString()} text characters.`);
  if (!generate) { console.log('Plan only: no paid requests. Use --generate to synthesize.'); return { plan, pending: jobs }; }
  if (!key) throw new Error('ELEVENLABS_API_KEY is missing.');
  const missing = [...new Set(jobs.filter(j => !j.voice_id).map(j => j.role))];
  if (missing.length) throw new Error('Assign character voices in config/tts-voices.json: ' + missing.join(', '));
  if (jobs.some(j => j.text.length > 5000)) throw new Error('A speech exceeds the v3 5,000-character limit. Split deliberately before generating.');
  await mkdir(path.join(root, 'public/audio/speeches'), { recursive: true });
  await mkdir(path.join(root, '.audio-work/receipts'), { recursive: true });
  await atomicJson(manifestFile, manifest);
  let persistence = Promise.resolve();
  const persist = () => { persistence = persistence.then(() => atomicJson(manifestFile, manifest)); return persistence; };
  async function runJob(job) {
    const target = path.join(root, 'public', job.src), receipt = path.join(root, '.audio-work/receipts', job.id + '-' + job.fingerprint + '.json');
    // A successful response is saved as a receipt before publication, so a restart
    // can recover it without paying again if manifest writing was interrupted.
    let saved = await readJson(receipt, null);
    if (!saved) {
      if ((await stat(target).catch(() => null))?.size) throw new Error(`Unindexed audio exists for ${job.id}; inspect before retrying.`);
      const response = await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(job.voice_id)}/with-timestamps?output_format=mp3_44100_128`, {
        method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(job.payload), signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) {
        let detail; try { detail = await response.json(); } catch { /* no body */ }
        const message = typeof detail?.detail?.message === 'string' ? detail.detail.message.replaceAll(key, '<REDACTED>') : '';
        throw new Error(`ElevenLabs HTTP ${response.status} for ${job.id} (${detail?.detail?.status || 'request_failed'}): ${message}. Batch stopped; no automatic retries.`);
      }
      saved = await response.json();
      if (typeof saved.audio_base64 !== 'string' || !saved.audio_base64.length) throw new Error(`Missing audio for ${job.id}; check account history before retrying.`);
      await atomicJson(receipt, saved);
    }
    const bytes = Buffer.from(saved.audio_base64, 'base64');
    if (!bytes.length) throw new Error('Empty decoded audio for ' + job.id);
    await writeFile(target + '.tmp', bytes); await rename(target + '.tmp', target);
    manifest.clips[job.id] = { role: job.role, text: job.text, src: job.src, fingerprint: job.fingerprint,
      cue: { text: job.cueText, start: cueStart(job.text, job.cueText, saved.alignment) } };
    await persist();
    console.log(`Saved ${Object.keys(manifest.clips).length}/${plan.length}: ${job.id} (${job.role})`);
  }
  let cursor = 0, failure;
  const worker = async () => {
    while (!failure && cursor < jobs.length) {
      const job = jobs[cursor++];
      try { await runJob(job); } catch (error) { failure = error; }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(2, concurrency)) }, worker));
  if (failure) throw failure;
  return { plan, pending: jobs, manifest };
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const value = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  const limit = value('--limit') === undefined ? undefined : Number(value('--limit'));
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) throw new Error('--limit must be positive.');
  generate({ root, generate: args.includes('--generate'), limit, onlyId: value('--id'), excludeRoles: value('--exclude-role') ? [value('--exclude-role')] : [] }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
