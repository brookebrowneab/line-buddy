import {copyFile,mkdir} from 'node:fs/promises';
const destination = new URL('../public/vendor/ort/', import.meta.url);
await mkdir(destination,{recursive:true});
for(const name of ['ort-wasm-simd-threaded.wasm','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.jsep.wasm','ort-wasm-simd-threaded.jsep.mjs']) {
 await copyFile(new URL('../node_modules/onnxruntime-web/dist/'+name,import.meta.url),new URL(name,destination));
}
