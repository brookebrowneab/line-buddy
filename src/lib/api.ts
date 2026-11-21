/** Public backend address; permanent provider credentials never enter this client. */
const base = (import.meta.env.VITE_TRANSCRIPTION_API_URL || '').replace(/\/$/, '');
const sessionKey = 'lines-class-session';
export function saveClassSession(token: string) { localStorage.setItem(sessionKey, token); }
export async function apiFetch(path: string, init: RequestInit = {}) {
  const token = base ? localStorage.getItem(sessionKey) : null;
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(base + path, { ...init, ...(token ? { headers } : {}) });
  if (response.status === 401 && base) localStorage.removeItem(sessionKey);
  return response;
}
