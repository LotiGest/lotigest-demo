import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src=readFileSync(new URL('./multi-date-abonos-ui.js',import.meta.url),'utf8');
const start=src.indexOf(' const mdMonths=[');
const stop=src.indexOf(' function mdMoneyInput(',start);
assert.ok(start>=0&&stop>start,'Las funciones de fechas están disponibles');
const {mdDateAutoSlash,mdDateISO,mdHumanDate}=new Function(src.slice(start,stop)+
 '; return {mdDateAutoSlash,mdDateISO,mdHumanDate};')();

test('separadores automáticos sin escribir plecas',()=>{
 for(const [raw,display] of [
  ['2','2'],['25','25'],['251','25/1'],['2511','25/11'],
  ['25112','25/11/2'],['251125','25/11/25'],
  ['21102025','21/10/2025'],['21/10/2025','21/10/2025'],
  ['','']
 ]){
  assert.equal(mdDateAutoSlash(raw).display,display,'Entrada: '+raw);
 }
});
test('año abreviado 25 se interpreta como 2025 (también al pegar)',()=>{
 for(const raw of ['251125','25/11/25','25-11-25','25.11.25','25112025','25/11/2025','25 Noviembre 25'])
  assert.equal(mdDateISO(raw),'2025-11-25','Fecha: '+raw);
 assert.equal(mdHumanDate(mdDateISO('251125')),'25 Noviembre 2025');
 assert.equal(mdDateISO('211026'),'2026-10-21');
 assert.equal(mdDateISO('21 Octubre 2026'),'2026-10-21');
 assert.equal(mdDateISO('2025-11-25'),'2025-11-25');
});
test('no acepta fechas inexistentes ni incompletas',()=>{
 for(const raw of ['321125','311125','290225','000125','251325','25112','2511202','abc','25/11','2025-02-29'])
  assert.equal(mdDateISO(raw),null,'Debe rechazar '+raw);
 assert.equal(mdDateISO('290224'),'2024-02-29');
 assert.equal(mdDateISO('311299'),'2099-12-31','El año de dos cifras siempre corresponde a 20xx; los futuros se rechazan al guardar');
});
test('admite borrado y edición con cursor interno sin duplicar plecas',()=>{
 let out=mdDateAutoSlash('251',3);
 assert.deepEqual(out,{display:'25/1',caret:4});
 out=mdDateAutoSlash('25/1',2);
 assert.deepEqual(out,{display:'25/1',caret:2});
 out=mdDateAutoSlash('25/11',5);
 assert.deepEqual(out,{display:'25/11',caret:5});
 out=mdDateAutoSlash('25',2);
 assert.deepEqual(out,{display:'25',caret:2});
 assert.deepEqual(mdDateAutoSlash('25 Noviembre 2025',17),{display:'25 Noviembre 2025',caret:17});
});
