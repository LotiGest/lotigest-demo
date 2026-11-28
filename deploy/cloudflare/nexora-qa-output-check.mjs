import assert from 'node:assert/strict';import {readFile,readdir,stat} from 'node:fs/promises';import {Script} from 'node:vm';
const dir=new URL('../../cloudflare-pages-nexora-qa/',import.meta.url);
const files=await readdir(dir);const html=await readFile(new URL('index.html',dir),'utf8');
for(const name of ['altos-arrayan-vista-proyecto.webp','app-icon-192.png','app-icon-512.png'])assert.ok(!files.includes(name),'Unexpected prior tenant asset: '+name);
for(const name of ['index.html','manifest.webmanifest','app-icon.svg','service-worker.js','acceso-nube.js'])assert.ok(files.includes(name),'Missing '+name);
assert.doesNotMatch(html,/GRUPO H|Altos del Arrayán|data:image\/(?:webp|png|jpe?g);base64,[A-Za-z0-9+/=]{128,}/i);
assert.match(html,/const arrayanFeatures=\[\];/);assert.match(html,/const OFFICIAL_LOT_PRICE_GROUPS = \{\};/);assert.match(html,/lots:\[\],clients:\[\],sales:\[\],payments:\[\]/);
assert.match(html,/lotigest_nexora_qa_pending_v1/);assert.match(html,/QA requiere verificar licencia/);
const manifest=JSON.parse(await readFile(new URL('manifest.webmanifest',dir),'utf8'));assert.deepEqual(manifest.icons.map(x=>x.src),['/app-icon.svg']);
let scripts=0;for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){if(/\bsrc\s*=/.test(m[1])||/\btype\s*=\s*["'](?:module|application\/json|application\/ld\+json)["']/.test(m[1]))continue;new Script(m[2],{filename:'QA-inline-'+(++scripts)+'.js'});}
assert.ok(scripts>0,'No inline scripts inspected');
console.log('QA template generated: '+files.length+' top-level files, '+scripts+' classic inline scripts parsed. Known legacy datasets absent. Visual and exhaustive tenant audit still required.');
