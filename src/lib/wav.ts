/** Decode and downmix/resample entirely in memory; no file or URL is created. */
export async function asFloat32Pcm(audio: Blob): Promise<Float32Array> {
  const decoder = new OfflineAudioContext(1,1,16000);
  const decoded = await decoder.decodeAudioData(await audio.arrayBuffer());
  if(decoded.duration < .1 || decoded.duration > 300) throw new Error('Record a speech between a moment and five minutes long.');
  const context = new OfflineAudioContext(1,Math.ceil(decoded.duration*16000),16000);
  const source=context.createBufferSource(); source.buffer=decoded; source.connect(context.destination); source.start();
  const rendered=await context.startRendering(); return new Float32Array(rendered.getChannelData(0));
}
