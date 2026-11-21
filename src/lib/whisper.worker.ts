import { env, pipeline } from '@huggingface/transformers';
import {decoderPrompt,hasSpeechEnergy,mergeChunks,SAMPLE_RATE,WHISPER_MODEL,WHISPER_REVISION} from './whisper-core';
const scope = self as unknown as {onmessage: ((e:MessageEvent)=>void)|null;postMessage:(data:unknown)=>void};
// Only immutable model/runtime downloads may leave this worker. Never audio,
// script prompts, transcripts, POST bodies, telemetry or inference API requests.
const download = self.fetch.bind(self);
let runtimeRoot='';
self.fetch = async (input: RequestInfo|URL, init?:RequestInit) => {
 const url=new URL(input instanceof Request?input.url:String(input));
 const method=init?.method||(input instanceof Request?input.method:'GET');
 const modelRoot=`https://huggingface.co/${WHISPER_MODEL}/resolve/${WHISPER_REVISION}/`;
 if(method!=='GET'||init?.body||(input instanceof Request&&input.body)||!(url.href.startsWith(modelRoot)||runtimeRoot&&url.href.startsWith(runtimeRoot)))throw new Error('Local speech recognition blocked a network request.');
 return download(input,init);
};
env.allowLocalModels=false;env.useBrowserCache=true;env.useFS=false;env.useFSCache=false;
// Use a dedicated worker and one WASM thread: GitHub Pages has no isolation headers.
if(env.backends.onnx.wasm){env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;}
let instance: any=null;
const engine='wasm';
const report=(phase:string,message:string,progress?:number)=>scope.postMessage({type:'progress',phase,message,progress});
async function load(root:string) {
 if(instance)return instance;
 runtimeRoot=root;
 if(env.backends.onnx.wasm)env.backends.onnx.wasm.wasmPaths=root;
 // Quantized WebGPU produced invalid transcripts in the real-audio acceptance test.
 // WASM is the validated, portable backend; never silently switch to cloud recognition.
 const options={revision:WHISPER_REVISION,dtype:'q8' as const,device:engine as 'wasm'|'webgpu',progress_callback:(p:any)=>{
   if(p.status==='progress')report('loading',`Downloading speech model: ${p.file}`,p.progress);
   else report('loading','Preparing the speech model on this device…');
 }};
 instance=await pipeline('automatic-speech-recognition',WHISPER_MODEL,options);
 report('ready',`Local Whisper ready (${engine}).`,100);return instance;
}
let busy=false;
scope.onmessage=async({data})=>{
 if(busy){scope.postMessage({type:'error',id:data.id,message:'Speech checking is already running.'});return;}
 busy=true;
 try{
  const pipe=await load(data.runtimeRoot);
  if(data.type==='init'){scope.postMessage({type:'done',id:data.id,model:`Whisper base.en (${engine})`});return;}
  const audio=data.audio as Float32Array;
  if(!(audio instanceof Float32Array)||audio.length<1600||audio.length>300*SAMPLE_RATE)throw new Error('Record between a moment and five minutes of speech.');
  let text='';
  if(hasSpeechEnergy(audio)){
   const encode=(text:string)=>pipe.tokenizer.encode(text,{add_special_tokens:false});
   const prefix=decoderPrompt(encode,data.targetLine,data.previousContextLines);
   // 25-second windows with a one-second boundary overlap keep memory bounded.
   const window=25*SAMPLE_RATE,step=24*SAMPLE_RATE;
   for(let offset=0;offset<audio.length;offset+=step){
    report('transcribing','Checking speech on this device…',Math.round(offset/audio.length*100));
    const chunk=audio.subarray(offset,Math.min(offset+window,audio.length));
    if(hasSpeechEnergy(chunk)){
     const features=await pipe.processor(chunk);
     const output=await pipe.model.generate({inputs:features.input_features,decoder_input_ids:prefix,max_new_tokens:Math.min(224,448-prefix.length),do_sample:false,return_timestamps:false});
     const ids=output.tolist()[0];
     if(!prefix.every((token,index)=>Number(ids[index])===token))throw new Error('The speech decoder returned an unsupported prompt format.');
     const generated=ids.slice(prefix.length);
     const part=pipe.tokenizer.decode(generated,{skip_special_tokens:true}).trim();
     text=mergeChunks(text,part);
    }
    if(offset+window>=audio.length)break;
   }
  }
  scope.postMessage({type:'done',id:data.id,text,model:`Whisper base.en (${engine})`});
 }catch(error){scope.postMessage({type:'error',id:data.id,message:error instanceof Error?error.message:'Local speech checking failed.'});}
 finally{busy=false;}
};
