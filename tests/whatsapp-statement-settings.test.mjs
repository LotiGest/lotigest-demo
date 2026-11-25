import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../deploy/cloudflare/document-branding-ui.js',import.meta.url),'utf8');
test('mensaje cordial distingue mensualidades pendientes y saldo contractual',()=>{const code=src.slice(src.indexOf('function lgStatementMessage('),src.indexOf('// Identidad de documentos'));const message=new Function(code+';return lgStatementMessage')()({client:'PRUEBA',residence:'TEST',asOf:'2026-11-25',base:100000,paid:250000,total:50000,prima:0,balance:950000},'GRUPO H','50499999999');assert.match(message,/L 500\.00/);assert.match(message,/L 9,500\.00/);assert.match(message,/cuotas futuras/);assert.match(src,/e\.submitter\?\.value==='revoke'/);});
