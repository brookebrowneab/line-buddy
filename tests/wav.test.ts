import { expect, it } from 'vitest';
import { pcmWave } from '../src/lib/wav';
it('writes duration from sample bytes and clamps mono PCM samples',async()=>{
  const samples=new Float32Array(16000);samples[0]=-2;samples[1]=2;
  const blob=pcmWave(samples),bytes=await blob.arrayBuffer(),view=new DataView(bytes);
  expect(blob.type).toBe('audio/wav');expect(blob.size).toBe(32044);
  expect(view.getUint32(24,true)).toBe(16000);expect(view.getUint32(40,true)).toBe(32000);
  expect(view.getInt16(44,true)).toBe(-32768);expect(view.getInt16(46,true)).toBe(32767);
});
