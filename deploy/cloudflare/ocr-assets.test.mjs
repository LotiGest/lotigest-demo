import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {installOcrAssets} from './ocr-assets.mjs';
test('la compilación rechaza un lector incompleto o alterado antes de publicar',async()=>{
 const dir=await mkdtemp(tmpdir()+'/lg-ocr-assets-');
 try{await assert.rejects(installOcrAssets(pathToFileURL(dir+'/'),{fetcher:async()=>new Response('archivo incompleto')}),/Recurso OCR incompleto/);}finally{await rm(dir,{recursive:true,force:true});}
});
test('los recursos fijan versión y el idioma español optimizado para teléfonos',async()=>{
 const assets=JSON.parse(await readFile(new URL('./ocr-assets.json',import.meta.url),'utf8'));
 assert.equal(assets.length,5);assert.ok(assets.every(x=>/^[a-f0-9]{64}$/.test(x.sha256)));
 assert.ok(assets.some(x=>x.path==='core/tesseract-core-lstm.wasm.js'));
 assert.ok(assets.some(x=>x.path==='core/tesseract-core-simd-lstm.wasm.js'));
 assert.match(assets.find(x=>x.path.endsWith('.gz')).url,/spa@1.0.0\/4.0.0_best_int/);
});
