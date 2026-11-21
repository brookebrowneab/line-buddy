const MAX_UPLOAD = 10 * 1024 * 1024;
const COOKIE = '__Host-lines_class';
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra } });
const encode = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const decode = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
async function hmac(secret) { return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']); }
async function issueSession(secret) {
  const claims = { id: crypto.randomUUID(), exp: Math.floor(Date.now() / 1000) + 7 * 86400 };
  const payload = encode(new TextEncoder().encode(JSON.stringify(claims)));
  const signature = encode(new Uint8Array(await crypto.subtle.sign('HMAC', await hmac(secret), new TextEncoder().encode(payload))));
  return payload + '.' + signature;
}
async function sessionFor(request, secret) {
  if (!secret) return null;
  const cookie = request.headers.get('Cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  if (!cookie) return null;
  try {
    const [payload, signature, extra] = cookie.split('.'); if (!payload || !signature || extra) return null;
    if (!await crypto.subtle.verify('HMAC', await hmac(secret), decode(signature), new TextEncoder().encode(payload))) return null;
    const data = JSON.parse(new TextDecoder().decode(decode(payload)));
    return typeof data.id === 'string' && data.exp > Date.now() / 1000 ? data : null;
  } catch { return null; }
}
async function boundedBytes(request, limit) {
  if (Number(request.headers.get('Content-Length')) > limit) throw new Error('too_large');
  const reader = request.body?.getReader(); if (!reader) return new Uint8Array();
  const chunks = []; let count = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break;
      count += value.byteLength; if (count > limit) { await reader.cancel(); throw new Error('too_large'); } chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(count); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
/** Accept our simple PCM WAV format; duration is computed from actual bytes, not client metadata. */
export async function wavDuration(file) {
  if (file.size < 44 || file.size > MAX_UPLOAD) return null;
  const bytes = new Uint8Array(await file.slice(0, 44).arrayBuffer()); const view = new DataView(bytes.buffer);
  const ascii = (offset, length) => String.fromCharCode(...bytes.slice(offset, offset + length));
  if (ascii(0,4) !== 'RIFF' || ascii(8,4) !== 'WAVE' || ascii(12,4) !== 'fmt ' || ascii(36,4) !== 'data' ||
      view.getUint32(4,true) !== file.size - 8 || view.getUint32(16,true) !== 16 || view.getUint16(20,true) !== 1 ||
      view.getUint16(22,true) !== 1 || view.getUint32(24,true) !== 16000 || view.getUint32(28,true) !== 32000 ||
      view.getUint16(32,true) !== 2 || view.getUint16(34,true) !== 16 || view.getUint32(40,true) !== file.size - 44 || (file.size - 44) % 2) return null;
  const seconds = (file.size - 44) / 32000;
  return seconds >= 0.1 && seconds <= 300 ? seconds : null;
}
async function debit(db, bucket, amount, limit, expiresAt) {
  if (amount > limit) return false;
  const row = await db.prepare('INSERT INTO usage_buckets (bucket, used, expires_at) VALUES (?, ?, ?) ON CONFLICT(bucket) DO UPDATE SET used = used + excluded.used WHERE used + excluded.used <= ? RETURNING used').bind(bucket, amount, expiresAt, limit).first();
  return !!row;
}
export function createWorker(fetchImpl = fetch) {
  return { async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const session = await sessionFor(request, env.SESSION_SECRET);
    if (url.pathname === '/api/transcription/status' && request.method === 'GET') return json({
      configured: !!env.ELEVENLABS_API_KEY && !!env.CLASS_ACCESS_CODE && !!env.SESSION_SECRET && !!env.DB,
      model: 'scribe_v3', requiresClassCode: true, authorized: !!session, requiresPcm: true,
    });
    if (request.method !== 'POST') return json({ error: 'Not found.' }, 404);
    if (request.headers.get('Origin') !== url.origin) return json({ error: 'This request must come from the Lines app.' }, 403);
    if (!env.DB || !env.SESSION_SECRET || !env.CLASS_ACCESS_CODE) return json({ error: 'Speech checking is not configured yet.' }, 503);
    try {
      if (url.pathname === '/api/class/login') {
        const period = Math.floor(Date.now() / 900_000), ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        const ipHash = encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip))));
        if (!await debit(env.DB, `login:${period}:${ipHash}`, 1, 120, (period + 1) * 900)) return json({ error: 'Too many code attempts. Wait a few minutes.' }, 429);
        const body = JSON.parse(new TextDecoder().decode(await boundedBytes(request, 1024)));
        // Hash both strings to avoid timing comparisons of user-controlled lengths.
        const key = await hmac(env.SESSION_SECRET);
        const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(body.code || '').trim()));
        const valid = await crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(env.CLASS_ACCESS_CODE));
        if (!valid) return json({ error: 'That class code did not match. Ask your teacher for the code.' }, 401);
        return json({ authorized: true }, 200, { 'Set-Cookie': `${COOKIE}=${await issueSession(env.SESSION_SECRET)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800` });
      }
      if (url.pathname !== '/api/transcription') return json({ error: 'Not found.' }, 404);
      if (!session) return json({ error: 'Enter the class code to use speech checking.' }, 401);
      if (!env.ELEVENLABS_API_KEY) return json({ error: 'Speech checking is not configured yet.' }, 503);
      if (!/^multipart\/form-data; boundary=/.test(request.headers.get('Content-Type') || '')) return json({ error: 'Send a recorded speech.' }, 415);
      const bytes = await boundedBytes(request, MAX_UPLOAD);
      const form = await new Request(request.url, { method: 'POST', headers: { 'Content-Type': request.headers.get('Content-Type') }, body: bytes }).formData();
      const file = form.get('audio');
      if (!file || typeof file === 'string') return json({ error: 'No audio recording was received.' }, 400);
      const seconds = await wavDuration(file);
      if (seconds === null) return json({ error: 'This recording format or length is not supported. Record again in the app (five minutes maximum).' }, 400);
      const charge = Math.ceil(seconds), day = Math.floor(Date.now() / 86400_000), expiry = (day + 2) * 86400;
      const globalBucket = `speech:${day}:class`, deviceBucket = `speech:${day}:${session.id}`;
      if (!await debit(env.DB, globalBucket, charge, Number(env.DAILY_CLASS_SECONDS || 36000), expiry)) return json({ error: 'The class has reached today’s listening limit. You can still practise by typing.' }, 429);
      if (!await debit(env.DB, deviceBucket, charge, Number(env.DAILY_DEVICE_SECONDS || 3600), expiry)) {
        await env.DB.prepare('UPDATE usage_buckets SET used = MAX(0, used - ?) WHERE bucket = ?').bind(charge, globalBucket).run();
        return json({ error: 'This device has reached today’s listening limit. You can still practise by typing.' }, 429);
      }
      ctx?.waitUntil(env.DB.prepare('DELETE FROM usage_buckets WHERE expires_at < ?').bind(Math.floor(Date.now() / 1000)).run());
      const upstream = new FormData(); upstream.set('file', file, 'speech.wav'); upstream.set('model_id','scribe_v3');
      upstream.set('language_code','eng'); upstream.set('tag_audio_events','false'); upstream.set('diarize','false'); upstream.set('no_verbatim','false');
      const response = await fetchImpl('https://api.elevenlabs.io/v1/speech-to-text', {
        method:'POST', headers:{'xi-api-key':env.ELEVENLABS_API_KEY}, body:upstream, signal:AbortSignal.timeout(60000),
      });
      if (!response.ok) return json({ error: response.status === 429 ? 'Speech checking is busy. Wait a moment and try again.' : 'Speech checking is unavailable. Please try again or type the first letters.' }, response.status === 429 ? 429 : 502);
      const result = await response.json();
      if (typeof result.text !== 'string') throw new Error('invalid_transcript');
      return json({ text:result.text, model:'scribe_v3' });
    } catch (error) {
      if (error.message === 'too_large') return json({ error:'Recording is too large. Try a shorter speech.' },413);
      return json({ error:'Speech checking could not finish. Please try again or type the first letters.' },502);
    }
  } };
}
export default createWorker();
