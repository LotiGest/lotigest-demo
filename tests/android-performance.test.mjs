import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('../deploy/cloudflare/contract-collections-only-ui.js',import.meta.url),'utf8');
const code=ui.slice(ui.indexOf('function ccPageSlice('),ui.indexOf('\n',ui.indexOf('function ccPageSlice(')));
const slice=new Function(code+';return ccPageSlice;')();
test('Android: 600 clientes, páginas de 40 sin omitir clientes y PC sin paginación',()=>{const all=Array.from({length:600},(_,i)=>i);assert.deepEqual(Array.from({length:15},(_,i)=>slice(all,i,true).items).flat(),all);assert.equal(slice(all,99,true).index,14);assert.deepEqual(slice(all,0,false).items,all);assert.deepEqual(slice([],0,true).items,[]);});
