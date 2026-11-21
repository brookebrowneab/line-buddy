export type WhisperState={phase:'idle'|'loading'|'ready'|'transcribing'|'error';message:string;progress?:number};
let state:WhisperState={phase:'idle',message:'The speech model downloads once, then runs on this device.'};
const listeners=new Set<()=>void>();
export const whisperState=()=>state;
export const subscribeWhisper=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
function update(next:WhisperState){state=next;for(const listener of listeners)listener();}
let worker:Worker|null=null,id=0;
let pending:{id:number;resolve:(value:any)=>void;reject:(reason:Error)=>void}|null=null;
let ready=false;
export function cancelWhisper(){worker?.terminate();worker=null;ready=false;pending?.reject(new Error('Speech checking was cancelled.'));pending=null;update({phase:'idle',message:'Speech checking cancelled. The model download is cached when supported.'});}
function getWorker(){
 if(worker)return worker;
 worker=new Worker(new URL('./whisper.worker.ts',import.meta.url),{type:'module'});
 worker.onmessage=({data})=>{
  if(data.type==='progress'){update({phase:data.phase,message:data.message,progress:data.progress});return;}
  if(data.id!==pending?.id)return;
  const job=pending;pending=null;if(!job)return;
  if(data.type==='error'){ready=false;worker?.terminate();worker=null;update({phase:'error',message:import.meta.env.DEV ? data.message : 'Local speech checking could not start. Try again or use typing.'});job.reject(new Error(state.message));}
  else {ready=true;update({phase:'ready',message:`${data.model} ready. Audio stays on this device.`,progress:100});job.resolve(data);}
 };
 worker.onerror=()=>{const job=pending;pending=null;worker?.terminate();worker=null;ready=false;const error=new Error('This browser could not run local speech checking. Try a shorter take or use typing.');update({phase:'error',message:error.message});job?.reject(error);};
 return worker;
}
function run(type:'init'|'transcribe',signal:AbortSignal,extra:Record<string,unknown>={},transfer:Transferable[]=[]):Promise<any>{
 if(signal.aborted)return Promise.reject(new Error('Speech checking was cancelled.'));
 if(pending)return Promise.reject(new Error('Speech checking is already running.'));
 return new Promise((resolve,reject)=>{
  const abort=()=>cancelWhisper();signal.addEventListener('abort',abort,{once:true});
  const finish=(callback:(value:any)=>void)=>(value:any)=>{signal.removeEventListener('abort',abort);callback(value);};
  pending={id:++id,resolve:finish(resolve),reject:finish(reject)};
  update({phase:type==='init'?'loading':'transcribing',message:type==='init'?'Preparing local speech recognition…':'Checking your speech on this device…'});
  try{getWorker().postMessage({id,type,runtimeRoot:new URL('vendor/ort/',document.baseURI).href,...extra},transfer);}
  catch(error){const job=pending;pending=null;worker?.terminate();worker=null;ready=false;signal.removeEventListener('abort',abort);const failure=error instanceof Error?error:new Error('Local speech checking failed. Try again or use typing.');update({phase:'error',message:failure.message});job?.reject(failure);}
 });
}
export async function initializeWhisper(signal:AbortSignal){if(!ready)await run('init',signal);}
export async function transcribePcm(audio:Float32Array,signal:AbortSignal,targetLine:string,previousContextLines:string[]=[]){
 await initializeWhisper(signal);
 return run('transcribe',signal,{audio,targetLine,previousContextLines},[audio.buffer]);
}
