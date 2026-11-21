import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTranscriptionServer } from './transcribe.mjs';

async function withServer(options, run) {
  const server = createTranscriptionServer(options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await run('http://127.0.0.1:' + server.address().port); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
const origin = { Origin: 'http://localhost:5173' };
function audio() { const f = new FormData(); f.set('audio', new Blob(['sample'], { type: 'audio/webm' }), 'speech.webm'); return f; }

test('missing configuration and untrusted origins never reach ElevenLabs', async () => {
  let called = false;
  await withServer({ apiKey: '', fetchImpl: () => { called = true; } }, async url => {
    const status = await fetch(url + '/api/transcription/status');
    assert.equal((await status.json()).configured, false);
    assert.equal((await fetch(url + '/api/transcription', { method: 'POST', headers: origin, body: audio() })).status, 503);
    assert.equal((await fetch(url + '/api/transcription', { method: 'POST', body: audio() })).status, 403);
  });
  assert.equal(called, false);
});
test('forwards only audio and fixed model options, returns raw text without credentials', async () => {
  let calls = 0;
  await withServer({ apiKey: 'server-secret', fetchImpl: async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.elevenlabs.io/v1/speech-to-text');
    assert.equal(init.headers['xi-api-key'], 'server-secret');
    assert.equal(init.body.get('model_id'), 'scribe_v3');
    assert.equal(init.body.get('no_verbatim'), 'false');
    assert.equal(init.body.get('keyterms'), null);
    assert.ok(init.body.get('file').size > 0);
    return Response.json({ text: 'O Romeo, Romeo!', words: [] });
  } }, async url => {
    const form = audio(); form.set('model_id', 'untrusted'); form.set('text', 'do not send');
    const res = await fetch(url + '/api/transcription', { method: 'POST', headers: origin, body: form });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { text: 'O Romeo, Romeo!', model: 'scribe_v3' });
  });
  assert.equal(calls, 1);
});
test('rejects missing audio and oversized requests before spending credits', async () => {
  let calls = 0;
  await withServer({ apiKey: 'secret', fetchImpl: async () => { calls++; } }, async url => {
    const form = new FormData(); form.set('audio', 'not audio');
    assert.equal((await fetch(url + '/api/transcription', { method: 'POST', headers: origin, body: form })).status, 400);
    const large = new FormData(); large.set('audio', new Blob([new Uint8Array(9 * 1024 * 1024)], { type: 'audio/webm' }), 'large');
    assert.equal((await fetch(url + '/api/transcription', { method: 'POST', headers: origin, body: large })).status, 413);
  });
  assert.equal(calls, 0);
});
test('sanitizes upstream errors and releases concurrency slot', async () => {
  await withServer({ apiKey: 'secret', fetchImpl: async () => new Response('secret upstream details', { status: 401 }) }, async url => {
    for (let i = 0; i < 2; i++) {
      const res = await fetch(url + '/api/transcription', { method: 'POST', headers: origin, body: audio() });
      assert.equal(res.status, 502);
      assert.ok(!(await res.text()).includes('secret'));
    }
  });
});
