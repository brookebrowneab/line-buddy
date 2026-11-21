import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CleanupError,deleteTranscript,transcribeWithCleanup} from './elevenlabs-cleanup.mjs';
function queue(){const ids=new Set();return {ids,add:async id=>ids.add(id),remove:async id=>ids.delete(id)};}
function provider(){let removed=false;return async(_url,init)=>{if(init.method==='DELETE'){removed=true;return new Response(null,{status:200});}return new Response(null,{status:removed?404:200});};}
test('cleanup verifies removal before returning text and never exposes the provider ID to the client',async()=>{
 const q=queue(),remote=provider();let deletes=0;
 const text=await transcribeWithCleanup(Response.json({text:'Queen Mab',transcription_id:'generated/id'}),{apiKey:'secret',queue:q,fetchImpl:async(url,init)=>{assert.ok(url.endsWith('generated%2Fid'));if(init.method==='DELETE'){deletes++;assert.ok(q.ids.has('generated/id'));}return remote(url,init);}});
 assert.equal(text,'Queen Mab');assert.equal(deletes,1);assert.equal(q.ids.size,0);
});
test('transient errors retry independently and header IDs are supported',async()=>{
 const q=queue(),remote=provider();let calls=0;
 await transcribeWithCleanup(new Response(JSON.stringify({text:'x'}),{headers:{'transcription-id':'from-header'}}),{apiKey:'secret',queue:q,fetchImpl:async(...args)=>{calls++;if(calls===1)throw Error('network');return remote(...args);}});
 assert.equal(calls,4);assert.equal(q.ids.size,0);
});
test('invalid results are cleaned up before errors; missing IDs stay blocked',async()=>{
 const q=queue();await assert.rejects(transcribeWithCleanup(Response.json({transcription_id:'bad-result'}),{queue:q,fetchImpl:provider(),apiKey:'secret'}),/Invalid transcript/);assert.equal(q.ids.size,0);
 await assert.rejects(transcribeWithCleanup(Response.json({text:'x'}),{queue:q,apiKey:'secret',fetchImpl:()=>assert.fail()}),CleanupError);assert.ok(q.ids.has('__missing_id__'));
});
test('an early not-found during asynchronous storage is retried, and successful deletion must be verified',async()=>{
 let get=0,deletes=0,removed=false;
 const result=await deleteTranscript(async(_url,init)=>{if(init.method==='DELETE'){deletes++;removed=true;return new Response(null,{status:200});}get++;return new Response(null,{status:get===1||removed?404:200});},'secret','id');
 assert.equal(result,true);assert.equal(deletes,1);
 const failed=await deleteTranscript(async()=>new Response(null,{status:200}),'secret','still-readable');assert.equal(failed,false);
});
test('an already absent record is accepted only during a later retry',async()=>{
 assert.equal(await deleteTranscript(async()=>new Response(null,{status:404}),'secret','old-id',true),true);
});
