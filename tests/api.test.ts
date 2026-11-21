import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });
it('uses a signed class session for the separate backend and forgets expired access', async () => {
  vi.stubEnv('VITE_TRANSCRIPTION_API_URL', 'https://lines-scribe.example.workers.dev/');
  const stored = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => stored.get(key) || null, setItem: (key: string, value: string) => stored.set(key, value), removeItem: (key: string) => stored.delete(key) });
  const fetch = vi.fn().mockResolvedValue({ status: 200 });
  vi.stubGlobal('fetch', fetch);
  const { apiFetch, saveClassSession } = await import('../src/lib/api');
  saveClassSession('signed-class-session');
  await apiFetch('/api/transcription/status');
  expect(fetch.mock.calls[0][0]).toBe('https://lines-scribe.example.workers.dev/api/transcription/status');
  expect(fetch.mock.calls[0][1].headers.get('Authorization')).toBe('Bearer signed-class-session');
  fetch.mockResolvedValueOnce({ status: 401 });
  await apiFetch('/api/transcription');
  await apiFetch('/api/transcription/status');
  expect(fetch.mock.calls[2][1].headers).toBeUndefined();
});
