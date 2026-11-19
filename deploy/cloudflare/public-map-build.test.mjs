import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildPagesFiles} from './pages-files.mjs';

test('Cloudflare Pages presenta compartir mapa, Pendientes y origen público propio',()=>{
 const root=new URL('../../',import.meta.url);
 const version=readFileSync(new URL('version.json',root),'utf8');
 const source=readFileSync(new URL('prueba-diseno-v08.html',root),'utf8');
 const html=source.replace(/CURRENT_VERSION='[^']+'/, "CURRENT_VERSION='"+JSON.parse(version).version+"'");
 const parser=readFileSync(new URL('payment-fields.mjs',root),'utf8');
 const output=buildPagesFiles(html,version,parser,'async function cloudLoad(');
 const page=output['index.html'];
 assert.match(page,/data-action="client-map-publish"/);
 assert.match(page,/data-action="client-pending-open"/);
 assert.match(page,/const clientMapOrigin = location\.origin;/);
 assert.ok(!page.includes('[data-action="client-map-publish"],[data-action="client-pending-open"]{display:none'));
 assert.ok(!page.includes('async function publishClientMap(button) {\n  if (cloudflareDemo) return;'));
 assert.ok(!page.includes('async function refreshClientRequests() {\n  if (cloudflareDemo) return;'));
});
test('página pública no imprime precios y ofrece selección de lotes y envío de solicitud',()=>{
 const html=readFileSync(new URL('./seleccionar-solar.html',import.meta.url),'utf8');
 assert.match(html,/id="map"/);
 assert.match(html,/id="request-form"/);
 assert.match(html,/selecciona/i);
 assert.ok(!html.includes('ownerClientId'));
 assert.ok(!html.includes('identity'));
 assert.match(html,/client-sales\/maps/);
});
