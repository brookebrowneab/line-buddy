// Device-only sound: the browser's built-in voice for scene partners, and
// record-and-play-back. Nothing is uploaded or saved.

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

// Devices ship joke and robot voices alongside the natural ones (macOS has
// "Bells", "Zarvox", "Bad News"...). Only ever use natural-sounding voices.
const NOVELTY = /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|deranged|hysterical|pipe|fred|junior|kathy|ralph|eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley|espeak|compact/i;
const NATURAL = [/daniel/i, /samantha/i, /google uk english/i, /karen/i, /serena/i, /kate/i, /oliver/i, /ava/i, /allison/i, /susan/i, /moira/i, /tessa/i, /alex/i, /google us english/i, /natural/i, /aria|jenny|guy|libby|ryan|sonia/i];

let voices: SpeechSynthesisVoice[] = [];
function loadVoices() {
  if (!canSpeak()) return;
  const english = speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en') && !NOVELTY.test(v.name));
  const rank = (v: SpeechSynthesisVoice) => { const i = NATURAL.findIndex((re) => re.test(v.name)); return i < 0 ? NATURAL.length : i; };
  const good = english.filter((v) => rank(v) < NATURAL.length).sort((a, b) => rank(a) - rank(b));
  // At most three good voices, so characters sound different but never strange.
  voices = good.length ? good.slice(0, 3) : english.filter((v) => v.default).concat(english).slice(0, 1);
}
if (canSpeak()) {
  loadVoices();
  speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
}
export const voiceNames = () => voices.map((v) => v.name);

/** Give each character a steady voice, with only a slight change in pitch. */
function voiceFor(who: string): { voice?: SpeechSynthesisVoice; pitch: number } {
  let h = 0;
  for (const c of who) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { voice: voices.length ? voices[h % voices.length] : undefined, pitch: 0.95 + ((h >> 3) % 3) * 0.05 };
}

/** Speak a line aloud. Resolves when finished (or straight away if the device has no voice). */
export function speak(text: string, who: string, rate = 1): Promise<void> {
  return new Promise((resolve) => {
    if (!canSpeak()) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    const { voice, pitch } = voiceFor(who);
    if (voice) u.voice = voice;
    u.pitch = pitch;
    u.rate = rate;
    // Some browsers never fire `onend`; don't let the scene hang.
    const guard = setTimeout(resolve, 4000 + text.length * 110);
    const done = () => { clearTimeout(guard); resolve(); };
    u.onend = done;
    u.onerror = done;
    speechSynthesis.speak(u);
  });
}
export function stopSpeaking() { if (canSpeak()) speechSynthesis.cancel(); }

export const canRecord = () =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

export type Recording = { stop: () => Promise<string> };
/** Start recording the microphone. `stop()` gives back a temporary URL to play. */
export async function startRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const rec = new MediaRecorder(stream);
  const parts: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
  rec.start();
  return {
    stop: () =>
      new Promise((resolve) => {
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          resolve(URL.createObjectURL(new Blob(parts, { type: rec.mimeType })));
        };
        rec.stop();
      }),
  };
}
