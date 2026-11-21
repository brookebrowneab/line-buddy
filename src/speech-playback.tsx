import { useEffect, useRef, useState } from 'react';
import { canSpeak, speak, stopSpeaking } from './lib/audio';
import { useProgress } from './lib/progress';
export function SpeechPlayback({ id, role, text }: { id: string; role: string; text: string }) {
  const [playing, setPlaying] = useState(false);
  const alive = useRef(true), ownsPlayback = useRef(false);
  const rate = useProgress().settings.rate;
  useEffect(() => { alive.current = true; return () => { alive.current = false; if (ownsPlayback.current) stopSpeaking(); }; }, []);
  if (!canSpeak()) return null;
  const toggle = async () => {
    if (playing) { stopSpeaking(); setPlaying(false); ownsPlayback.current = false; return; }
    ownsPlayback.current = true; setPlaying(true);
    await speak(text, role, rate, id);
    ownsPlayback.current = false; if (alive.current) setPlaying(false);
  };
  return <button className="btn btn-small" aria-pressed={playing} onClick={() => void toggle()}>{playing ? 'Stop' : 'Hear speech'}</button>;
}
