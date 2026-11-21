import { CleanupError, deleteTranscript, transcribeWithCleanup } from './elevenlabs-cleanup.mjs';
import http from 'node:http';
import { pathToFileURL } from 'node:url';

const MAX_BYTES = 8 * 1024 * 1024;
export function createTranscriptionServer({ apiKey = process.env.ELEVENLABS_API_KEY,
  model = process.env.ELEVENLABS_STT_MODEL || 'scribe_v3',
  allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(','),
  fetchImpl = fetch } = {}) {
  const pending = new Map();
  const queue = { add: async id => { pending.set(id, Date.now()); }, remove: async id => { pending.delete(id); } };
  const retryTimer = setInterval(async () => {
    for (const [id, created] of pending) if (id !== '__missing_id__' && await deleteTranscript(fetchImpl, apiKey, id, Date.now() - created >= 60000)) pending.delete(id);
  }, 30000);
  retryTimer.unref();
  let active = false;
  let windowStart = Date.now(), requests = 0;
  const server = http.createServer(async (req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    // Local comparison server only. No wildcard CORS or caller-controlled upstream URL.
    // Same-origin GET requests often omit Origin; status contains no secret.
    if (req.url === '/api/transcription/status' && req.method === 'GET' &&
        (!req.headers.origin || allowedOrigins.includes(req.headers.origin))) {
      return reply(200, { configured: !!apiKey, model, cleanupReady: pending.size === 0 });
    }
    if (!allowedOrigins.includes(req.headers.origin)) return reply(403, { error: 'This app origin is not allowed.' });
    if (req.url !== '/api/transcription' || req.method !== 'POST') return reply(404, { error: 'Not found.' });
    if (pending.size) return reply(503, { error: 'Speech checking is paused while recording cleanup is retried. You can still practise by typing.' });
    if (!apiKey) return reply(503, { error: 'ElevenLabs is not configured. Set ELEVENLABS_API_KEY on the server, or use Browser.' });
    if (!/^multipart\/form-data; boundary=/.test(req.headers['content-type'] || '')) return reply(415, { error: 'Send a recorded audio file.' });
    if (Date.now() - windowStart > 60_000) { windowStart = Date.now(); requests = 0; }
    if (active || requests >= 30) return reply(429, { error: 'Transcription is busy. Wait a moment and try again.' });
    active = true; requests++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    // Finish provider cleanup even if the browser leaves after submitting audio.
    try {
      const chunks = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BYTES) { reply(413, { error: 'Recording is too large. Try a shorter speech.' }); return; }
        chunks.push(chunk);
      }
      const request = new Request('http://localhost/upload', { method: 'POST',
        headers: { 'content-type': req.headers['content-type'] }, body: Buffer.concat(chunks) });
      const form = await request.formData();
      const file = form.get('audio');
      if (!file || typeof file === 'string' || !file.size || !/^(audio\/|video\/webm)/.test(file.type)) {
        return reply(400, { error: 'No valid audio recording was received.' });
      }
      const upstream = new FormData();
      upstream.set('file', file, 'speech.' + (file.type.includes('mp4') ? 'mp4' : file.type.includes('ogg') ? 'ogg' : 'webm'));
      upstream.set('model_id', model);
      upstream.set('language_code', 'eng');
      upstream.set('tag_audio_events', 'false');
      upstream.set('diarize', 'false');
      upstream.set('no_verbatim', 'false');
      // No expected script or keyterms: keep the initial comparison unbiased and avoid add-on charges.
      const response = await fetchImpl('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST', headers: { 'xi-api-key': apiKey }, body: upstream, signal: controller.signal });
      if (!response.ok) {
        const status = response.status;
        return reply(status === 429 ? 429 : 502, { error: status === 401 || status === 403
          ? 'ElevenLabs rejected the server credentials. Check the API key and Speech to Text access.'
          : status === 429 ? 'ElevenLabs usage or rate limit reached. Try Browser or check your account.'
          : 'ElevenLabs could not transcribe this recording. Try again or use Browser.' });
      }
      const text = await transcribeWithCleanup(response, { fetchImpl, apiKey, queue });
      reply(200, { text, model });
    } catch (error) {
      if (error instanceof CleanupError) { if (!res.destroyed && !res.writableEnded) reply(503, { error: error.message }); return; }
      if (!res.destroyed && !res.writableEnded) reply(controller.signal.aborted ? 504 : 502,
        { error: controller.signal.aborted ? 'Transcription timed out. Try a shorter speech or Browser.' : 'Transcription failed. Try again or use Browser.' });
    } finally { clearTimeout(timer); active = false; }
  });
  server.on('close', () => clearInterval(retryTimer));
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createTranscriptionServer();
  server.requestTimeout = 90_000;
  server.listen(Number(process.env.TRANSCRIPTION_PORT || 8787), '127.0.0.1', () => {
    console.log('Local transcription server: http://127.0.0.1:' + server.address().port);
    console.log('ElevenLabs key ' + (process.env.ELEVENLABS_API_KEY ? 'configured' : 'missing; Browser remains available'));
  });
}
