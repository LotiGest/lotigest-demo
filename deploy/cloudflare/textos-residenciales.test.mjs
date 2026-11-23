import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildPagesFiles} from './pages-files.mjs';

test('los textos visibles de LOTIGEST PRO no remiten a plataformas ajenas para subir planos',()=>{
 const root=new URL('../../',import.meta.url);
 const html=readFileSync(new URL('prueba-diseno-v08.html',root),'utf8');
 const version=readFileSync(new URL('version.json',root),'utf8');
 const parser=readFileSync(new URL('payment-fields.mjs',root),'utf8');
 const number=JSON.parse(version).version;
 const result=buildPagesFiles(html.replace(/CURRENT_VERSION='[^']+'/, "CURRENT_VERSION='"+number+"'"),version,parser,'async function cloudLoad(){}');
 const output=result['index.html'];
 assert.ok(output,'Se genera el HTML de producción');
 assert.doesNotMatch(output,/chat\s*[- ]?\s*gpt|openai|chatgpt\.site/i,'No se menciona el origen de asistencia en la interfaz ni sus scripts');
 assert.match(output,/Para agregar otra residencial, pulsa «\+ Nueva residencial»/);
 assert.match(output,/El PDF queda guardado como documento de referencia/);
 assert.match(output,/no dibuja automáticamente las calles ni los solares/);
 assert.match(output,/Las residenciales y los registros existentes se conservan por separado/);
 assert.match(output,/const clientMapOrigin = location\.origin;/,'Se conserva el mismo origen de LOTIGEST para el mapa de clientes');
});
