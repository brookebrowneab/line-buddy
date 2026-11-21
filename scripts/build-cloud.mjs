import { cp, mkdir, rename, writeFile, readFile } from 'node:fs/promises';
await rename('dist','dist-client-stage');
await mkdir('dist/server',{recursive:true}); await mkdir('dist/.openai',{recursive:true});
await rename('dist-client-stage','dist/client');
await cp('worker/index.mjs','dist/server/index.js');
await cp('.openai/hosting.json','dist/.openai/hosting.json');
// Standard Workers asset configuration; Sites packages both dist/client and the ESM entry.
await writeFile('dist/server/wrangler.json',JSON.stringify({name:'lines',main:'index.js',compatibility_date:'2026-11-20',assets:{directory:'../client',binding:'ASSETS',run_worker_first:['/api/*']}},null,2));
console.log('Cloud build: dist/server/index.js + dist/client (361 speech recordings)');
