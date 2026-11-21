type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onstart?: () => void;
  onresult?: (event: any) => void;
  onerror?: (event: { error: string }) => void;
  onend?: () => void;
  start: () => void; stop: () => void; abort: () => void;
};
export type BrowserRecognitionCallbacks = {
  ready: () => void; complete: (text: string) => void; error: (message: string) => void;
};
export function browserRecognitionError(code: string): string {
  if (code === 'not-allowed' || code === 'service-not-allowed') return 'Browser speech recognition was denied. Check microphone and speech permissions, or open this local app in Chrome or Safari.';
  if (code === 'network') return 'The browser speech service could not connect (network error). The in-app browser may not support this service. Open this same local address in Chrome or Safari, or try ElevenLabs.';
  if (code === 'audio-capture') return 'The browser could not access the microphone. Stop other recordings and check your microphone settings.';
  if (code === 'no-speech') return 'The browser did not hear speech. Check your microphone and try again.';
  return `Browser recognition stopped (${code || 'unknown error'}). Try again, open this local address in Chrome or Safari, or use ElevenLabs.`;
}
/** A single recognition session. End and error callbacks belong only to this take. */
export function startBrowserRecognition(rec: Recognition, language: string, callbacks: BrowserRecognitionCallbacks) {
  let ended = false, transcript = '';
  rec.lang = language; rec.continuous = true; rec.interimResults = false;
  rec.onresult = event => {
    if (ended) return;
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) transcript += ' ' + event.results[i][0].transcript;
    }
  };
  rec.onerror = event => {
    if (ended) return;
    ended = true; callbacks.error(browserRecognitionError(event.error));
  };
  rec.onend = () => { if (!ended) { ended = true; callbacks.complete(transcript.trim()); } };
  rec.onstart = () => { if (!ended) callbacks.ready(); };
  try { rec.start(); } catch { ended = true; callbacks.error('Browser recognition could not start. Close other recordings and try again.'); }
  return {
    stop: () => { if (!ended) { try { rec.stop(); } catch { ended = true; callbacks.error('Browser recognition could not stop. Try again.'); } } },
    cancel: () => { ended = true; try { rec.abort(); } catch { /* already stopped */ } },
  };
}
