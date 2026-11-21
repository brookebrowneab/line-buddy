import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorker, wavDuration } from '../worker/index.mjs';
function database() {
  const buckets=new Map(), pending=new Set();
  return { buckets, pending, prepare(sql) {
    if(sql.startsWith('SELECT COUNT')) return { async first() { return { pending:pending.size }; } };
    if(sql.startsWith('SELECT transcription_id')) return {async all(){return {results:[...pending].filter(id=>id!=='__missing_id__').map(transcription_id=>({transcription_id,created_at:Math.floor(Date.now()/1000)-120}))};}};
    return { bind(...args) { return {
      async first() { const [key,amount,,limit]=args;const previous=buckets.get(key)||0;if(previous+amount>limit)return null;buckets.set(key,previous+amount);return {used:previous+amount}; },
      async run() {
        if(sql.startsWith('INSERT OR IGNORE INTO transcription_cleanup'))pending.add(args[0]);
        if(sql.startsWith('DELETE FROM transcription_cleanup'))pending.delete(args[0]);
        if(sql.startsWith('UPDATE'))buckets.set(args[1],Math.max(0,(buckets.get(args[1])||0)-args[0]));return {success:true};
      },
    }; } }; }
  };
}
const origin='https://lines.example.test';
function wav(seconds=1) {
  const b=new ArrayBuffer(44+32000*seconds),v=new DataView(b);
  const t=(o,s)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));
  t(0,'RIFF');v.setUint32(4,b.byteLength-8,true);t(8,'WAVE');t(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);t(36,'data');v.setUint32(40,b.byteLength-44,true);
  return new File([b],'speech.wav',{type:'audio/wav'});
}
function setup(fetchImpl=async()=>Response.json({text:'O, then I see Queen Mab.',transcription_id:'test-speech'}), deleteImpl=async()=>new Response(null,{status:200})) {
  const removed=new Set();
  const provider=async(url,init)=>{
    if(init.method==='GET')return new Response(null,{status:removed.has(url)?404:200});
    if(init.method==='DELETE'){const response=await deleteImpl(url,init);if(response.ok)removed.add(url);return response;}
    removed.clear();return fetchImpl(url,init);
  };
  return {worker:createWorker(provider),env:{DB:database(),CLASS_ACCESS_CODE:'test-class-only',SESSION_SECRET:'test-session-secret',ELEVENLABS_API_KEY:'test-api-only',ASSETS:{fetch:async()=>new Response('asset')}},ctx:{waitUntil(){}}};
}
async function login(s) {
  const r=await s.worker.fetch(new Request(origin+'/api/class/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({code:'test-class-only'})}),s.env,s.ctx);
  assert.equal(r.status,200);const cookie=r.headers.get('Set-Cookie');assert.match(cookie,/HttpOnly; Secure; SameSite=Strict/);return cookie.split(';')[0];
}
function upload(cookie,file=wav(),extra={}) {const f=new FormData();f.set('audio',file);f.set('model_id','untrusted');return new Request(origin+'/api/transcription',{method:'POST',headers:{Origin:origin,Cookie:cookie,...extra},body:f});}
test('status is anonymous but does not reveal secrets; transcription requires class login',async()=>{
  let calls=0;const s=setup(async()=>{calls++;return Response.json({text:'x'});});
  const status=await s.worker.fetch(new Request(origin+'/api/transcription/status'),s.env,s.ctx);const body=await status.json();assert.equal(body.authorized,false);assert.equal(body.requiresPcm,true);assert.ok(!JSON.stringify(body).includes('test-api-only'));
  assert.equal((await s.worker.fetch(upload(''),s.env,s.ctx)).status,401);assert.equal(calls,0);
});
test('wrong codes, cross-origin requests and tampered cookies cannot spend credits',async()=>{
  let calls=0;const s=setup(async()=>{calls++;return Response.json({text:'x'});});
  const wrong=await s.worker.fetch(new Request(origin+'/api/class/login',{method:'POST',headers:{Origin:origin},body:JSON.stringify({code:'wrong'})}),s.env,s.ctx);assert.equal(wrong.status,401);
  const cookie=await login(s);assert.equal((await s.worker.fetch(upload(cookie,wav(),{Origin:'https://other.test'}),s.env,s.ctx)).status,403);
  assert.equal((await s.worker.fetch(upload(cookie+'bad'),s.env,s.ctx)).status,401);assert.equal(calls,0);
});
test('valid session sends a bounded WAV to Scribe v3 and meters its actual duration',async()=>{
  let calls=0;const s=setup(async(url,init)=>{calls++;assert.equal(init.body.get('model_id'),'scribe_v3');assert.equal(init.body.get('no_verbatim'),'false');assert.equal(init.headers['xi-api-key'],'test-api-only');return Response.json({text:'Oh then I see Queen Mab',transcription_id:'test-speech'});});
  const cookie=await login(s);const r=await s.worker.fetch(upload(cookie,wav(2)),s.env,s.ctx);assert.equal(r.status,200);assert.deepEqual(await r.json(),{text:'Oh then I see Queen Mab',model:'scribe_v3'});assert.equal(calls,1);assert.ok([...s.env.DB.buckets.entries()].filter(([k])=>k.startsWith('speech:')).every(([,n])=>n===2));
});
test('non-WAV audio and falsified duration metadata are rejected before transcription',async()=>{
  let calls=0;const s=setup(async()=>{calls++;return Response.json({text:'x'});});const cookie=await login(s);
  assert.equal((await s.worker.fetch(upload(cookie,new File(['bad'],'speech.webm',{type:'audio/webm'})),s.env,s.ctx)).status,400);
  const file=wav();const b=await file.arrayBuffer();new DataView(b).setUint32(40,10,true);assert.equal(await wavDuration(new File([b],'bad.wav')),null);assert.equal(calls,0);
});
test('daily limits fail closed and do not call ElevenLabs',async()=>{
  let calls=0;const s=setup(async()=>{calls++;return Response.json({text:'x'});});s.env.DAILY_CLASS_SECONDS='1';const cookie=await login(s);assert.equal((await s.worker.fetch(upload(cookie,wav(2)),s.env,s.ctx)).status,429);assert.equal(calls,0);
});
test('assets remain ordinary static files and failures do not expose provider credentials',async()=>{
  const s=setup(async()=>new Response('sensitive provider detail',{status:401}));assert.equal(await(await s.worker.fetch(new Request(origin+'/audio/test.mp3'),s.env,s.ctx)).text(),'asset');
  const r=await s.worker.fetch(upload(await login(s)),s.env,s.ctx);assert.equal(r.status,502);assert.ok(!(await r.text()).includes('sensitive'));
});
test('separate Pages origin can preflight, log in and transcribe with a signed bearer session',async()=>{
  const s=setup();s.env.APP_ORIGIN=origin;
  const api='https://lines-scribe.example.workers.dev';
  const preflight=await s.worker.fetch(new Request(api+'/api/class/login',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,authorization'}}),s.env,s.ctx);
  assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),origin);
  const logged=await s.worker.fetch(new Request(api+'/api/class/login',{method:'POST',headers:{Origin:origin},body:JSON.stringify({code:'test-class-only'})}),s.env,s.ctx);
  const {token}=await logged.json();assert.equal(typeof token,'string');
  const status=await s.worker.fetch(new Request(api+'/api/transcription/status',{headers:{Origin:origin,Authorization:`Bearer ${token}`}}),s.env,s.ctx);
  assert.equal((await status.json()).authorized,true);
  const audio=new FormData();audio.set('audio',wav());
  const result=await s.worker.fetch(new Request(api+'/api/transcription',{method:'POST',headers:{Origin:origin,Authorization:`Bearer ${token}`},body:audio}),s.env,s.ctx);
  assert.equal(result.status,200);assert.equal(result.headers.get('Access-Control-Allow-Origin'),origin);
  const denied=await s.worker.fetch(new Request(api+'/api/class/login',{method:'OPTIONS',headers:{Origin:'https://evil.example'}}),s.env,s.ctx);
  assert.equal(denied.status,403);assert.equal(denied.headers.get('Access-Control-Allow-Origin'),null);
  const bad=await s.worker.fetch(new Request(api+'/api/transcription/status',{headers:{Origin:origin,Authorization:`Bearer ${token}tampered`}}),s.env,s.ctx);
  assert.equal((await bad.json()).authorized,false);
});
test('deletion failures persist only provider IDs, pause uploads and are retried by the scheduler',async()=>{
  let uploads=0,deletes=0,fail=true;
  const s=setup(async()=>{uploads++;return Response.json({text:'private words',transcription_id:'only-this-request'});},async(url,init)=>{deletes++;assert.ok(url.endsWith('/only-this-request'));assert.equal(init.headers['xi-api-key'],'test-api-only');return new Response(null,{status:fail?503:200});});
  const cookie=await login(s);
  const result=await s.worker.fetch(upload(cookie),s.env,s.ctx);assert.equal(result.status,503);
  assert.equal(deletes,3);assert.deepEqual([...s.env.DB.pending],['only-this-request']);assert.ok(!(await result.text()).includes('private words'));
  assert.equal((await s.worker.fetch(upload(cookie),s.env,s.ctx)).status,503);assert.equal(uploads,1);
  fail=false;const tasks=[];s.worker.scheduled({},s.env,{waitUntil:p=>tasks.push(p)});await Promise.all(tasks);
  assert.equal(s.env.DB.pending.size,0);assert.equal(deletes,4);
  assert.equal((await s.worker.fetch(upload(cookie),s.env,s.ctx)).status,200);
});
test('missing provider IDs pause listening rather than claiming deletion succeeded',async()=>{
  const s=setup(async()=>Response.json({text:'not saved locally'}));const cookie=await login(s);
  assert.equal((await s.worker.fetch(upload(cookie),s.env,s.ctx)).status,503);
  assert.deepEqual([...s.env.DB.pending],['__missing_id__']);
});
