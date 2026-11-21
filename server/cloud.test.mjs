import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorker, wavDuration } from '../worker/index.mjs';
function database() {
  const buckets=new Map();
  return { buckets, prepare(sql) { return { bind(...args) { return {
    async first() { const [key,amount,,limit]=args; const previous=buckets.get(key)||0;if(previous+amount>limit)return null;buckets.set(key,previous+amount);return {used:previous+amount}; },
    async run() {if(sql.startsWith('UPDATE'))buckets.set(args[1],Math.max(0,(buckets.get(args[1])||0)-args[0]));return {success:true};},
  }; } }; } };
}
const origin='https://lines.example.test';
function wav(seconds=1) {
  const b=new ArrayBuffer(44+32000*seconds),v=new DataView(b);
  const t=(o,s)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));
  t(0,'RIFF');v.setUint32(4,b.byteLength-8,true);t(8,'WAVE');t(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);t(36,'data');v.setUint32(40,b.byteLength-44,true);
  return new File([b],'speech.wav',{type:'audio/wav'});
}
function setup(fetchImpl=async()=>Response.json({text:'O, then I see Queen Mab.'})) {
  return {worker:createWorker(fetchImpl),env:{DB:database(),CLASS_ACCESS_CODE:'test-class-only',SESSION_SECRET:'test-session-secret',ELEVENLABS_API_KEY:'test-api-only',ASSETS:{fetch:async()=>new Response('asset')}},ctx:{waitUntil(){}}};
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
  let calls=0;const s=setup(async(url,init)=>{calls++;assert.equal(init.body.get('model_id'),'scribe_v3');assert.equal(init.body.get('no_verbatim'),'false');assert.equal(init.headers['xi-api-key'],'test-api-only');return Response.json({text:'Oh then I see Queen Mab'});});
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
