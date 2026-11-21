/** Canonical mono 16-bit PCM WAV: the server meters actual sample bytes. */
export function pcmWave(samples: Float32Array): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2), view = new DataView(buffer);
  const text = (offset: number, value: string) => [...value].forEach((c,i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0,'RIFF'); view.setUint32(4,buffer.byteLength-8,true); text(8,'WAVE'); text(12,'fmt ');
  view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,1,true);
  view.setUint32(24,16000,true); view.setUint32(28,32000,true); view.setUint16(32,2,true); view.setUint16(34,16,true);
  text(36,'data'); view.setUint32(40,samples.length*2,true);
  for(let i=0;i<samples.length;i++) { const x=Math.max(-1,Math.min(1,samples[i])); view.setInt16(44+i*2,x<0?x*32768:x*32767,true); }
  return new Blob([buffer],{type:'audio/wav'});
}
export async function asPcmWave(audio: Blob): Promise<Blob> {
  const decoder = new OfflineAudioContext(1,1,16000);
  const decoded = await decoder.decodeAudioData(await audio.arrayBuffer());
  if(decoded.duration < .1 || decoded.duration > 300) throw new Error('Record a speech between a moment and five minutes long.');
  const context = new OfflineAudioContext(1,Math.ceil(decoded.duration*16000),16000);
  const source=context.createBufferSource(); source.buffer=decoded; source.connect(context.destination); source.start();
  const rendered=await context.startRendering(); return pcmWave(rendered.getChannelData(0));
}
