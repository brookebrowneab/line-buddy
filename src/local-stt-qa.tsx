// Development-only acceptance harness. Production routing excludes this module.
import {useRef,useState,useSyncExternalStore} from 'react';
import {transcribeRecording} from './lib/transcription';
import {whisperState,subscribeWhisper} from './lib/local-whisper';
import recordings from './data/recordings.json';
export default function LocalSttQa(){
 const [file,setFile]=useState<Blob|null>(null);
 const [target,setTarget]=useState('O, then I see Queen Mab hath been with you.');
 const [result,setResult]=useState('');
 const controller=useRef<AbortController|null>(null);
 const status=useSyncExternalStore(subscribeWhisper,whisperState);
 const loadQueenMab=async()=>{
  const clip=recordings.clips['28641c00'];
  const response=await fetch(new URL(clip.src,document.baseURI));
  if(!response.ok){setResult('Could not load the synthetic performance.');return;}
  setFile(await response.blob());setTarget(clip.text);setResult('Loaded the prerecorded AI character performance, not student audio.');
 };
 const silence=()=>{
  const bytes=new ArrayBuffer(32044),view=new DataView(bytes);
  for(const [at,text] of [[0,'RIFF'],[8,'WAVEfmt '],[36,'data']] as const)for(let i=0;i<text.length;i++)view.setUint8(at+i,text.charCodeAt(i));
  view.setUint32(4,32036,true);view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);view.setUint32(40,32000,true);
  setFile(new Blob([bytes],{type:'audio/wav'}));setResult('Loaded one second of digital silence. Expected transcript: empty; accuracy: 0.');
 };
 const run=async()=>{
  if(!file)return;controller.current=new AbortController();setResult('Running');const started=performance.now();
  try{const value=await transcribeRecording(file,controller.current.signal,target);setResult(JSON.stringify({...value,seconds:(performance.now()-started)/1000},null,2));}
  catch(error){setResult(error instanceof Error?error.message:String(error));}
 };
 return <main className="page"><h1>Local speech engine check</h1>
  <p>Development only. Uses the same transcription function as rehearsal. All decoding runs on this device using WASM.</p>
  <button onClick={()=>void loadQueenMab()}>Load synthetic Queen Mab performance</button>{' '}<button onClick={silence}>Load silence</button>
  <label>Test clip<input type="file" accept="audio/*" onChange={e=>setFile(e.target.files?.[0]||null)} /></label>
  <label>Target line<textarea value={target} onChange={e=>setTarget(e.target.value)} /></label>
  <button onClick={()=>void run()}>Check locally</button>{' '}<button onClick={()=>controller.current?.abort()}>Cancel</button>
  <p role="status">{status.message} {status.progress?.toFixed(0)}</p><pre style={{whiteSpace:'pre-wrap'}}>{result}</pre>
 </main>;
}
