const endpoint = 'https://api.elevenlabs.io/v1/speech-to-text';
export class CleanupError extends Error {
  constructor() { super('Recording cleanup could not be confirmed. Speech checking is paused; you can still practise by typing.'); }
}
/** Delete only an ID returned by this transcription request, never an ID from the browser. */
export async function deleteTranscript(fetchImpl, apiKey, id, allowAbsent = false) {
  const url = `${endpoint}/transcripts/${encodeURIComponent(id)}`;
  const headers = { 'xi-api-key': apiKey };
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, attempt * 300));
    try {
      // A new record can be saved asynchronously after the transcription response.
      const before = await fetchImpl(url, { method: 'GET', headers, signal: AbortSignal.timeout(2000) });
      await before.body?.cancel();
      if (before.status === 404) { if (allowAbsent) return true; continue; }
      if (!before.ok) continue;
      const removed = await fetchImpl(url, { method: 'DELETE', headers, signal: AbortSignal.timeout(2000) });
      await removed.body?.cancel();
      if (!removed.ok && removed.status !== 404) continue;
      const after = await fetchImpl(url, { method: 'GET', headers, signal: AbortSignal.timeout(2000) });
      await after.body?.cancel();
      if (after.status === 404) return true;
    } catch { /* Retry with independent timeouts even after the browser disconnects. */ }
  }
  return false;
}
export async function transcribeWithCleanup(response, { fetchImpl, apiKey, queue }) {
  let result;
  try { result = await response.json(); } catch { result = {}; }
  const id = result.transcription_id || response.headers.get('transcription-id');
  if (typeof id !== 'string' || !id || id.length > 256) {
    await queue.add('__missing_id__');
    throw new CleanupError();
  }
  // Persist before attempting deletion so the scheduled worker can retry a failed cleanup.
  try { await queue.add(id); }
  catch {
    // A database outage must not prevent the immediate provider deletion attempt.
    if (!await deleteTranscript(fetchImpl, apiKey, id)) throw new CleanupError();
    throw new Error('Cleanup queue unavailable');
  }
  if (!await deleteTranscript(fetchImpl, apiKey, id)) throw new CleanupError();
  await queue.remove(id);
  if (typeof result.text !== 'string') throw new Error('Invalid transcript');
  return result.text;
}
export function cleanupQueue(db) {
  return {
    add: id => db.prepare('INSERT OR IGNORE INTO transcription_cleanup (transcription_id, created_at) VALUES (?, ?)').bind(id, Math.floor(Date.now() / 1000)).run(),
    remove: id => db.prepare('DELETE FROM transcription_cleanup WHERE transcription_id = ?').bind(id).run(),
    async pending() { return (await db.prepare('SELECT COUNT(*) AS pending FROM transcription_cleanup').first()).pending > 0; },
    async entries() { return (await db.prepare("SELECT transcription_id, created_at FROM transcription_cleanup WHERE transcription_id != '__missing_id__' AND created_at <= unixepoch() - 60 ORDER BY created_at LIMIT 20").all()).results; },
  };
}
export async function retryCleanup(env, fetchImpl = fetch) {
  const queue = cleanupQueue(env.DB);
  for (const { transcription_id: id, created_at: created } of await queue.entries()) {
    if (await deleteTranscript(fetchImpl, env.ELEVENLABS_API_KEY, id, Date.now() / 1000 - created >= 60)) await queue.remove(id);
  }
}
