import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validMapLot,moneyCents} from '../../functions/api/client-sales/_shared.js';

test('el mapa público nunca expone precios ni personas, aun si llegan en la carga administrativa',()=>{
 const entry=validMapLot({id:'AR-B1',number:'5',block:'B',stage:1,kind:'solar',available:true,
  points:[[1,1],[20,2],[15,30]],label:[8,12],area:125,price:140000,clientName:'PROPIETARIO',
  identity:'0801199900000',balances:[100]});
 assert.equal(entry.block,'B');
 assert.equal(entry.stage,'1');
 assert.equal(entry.available,true);
 assert.equal(entry.price,undefined);
 assert.equal(entry.clientName,undefined);
 assert.equal(entry.identity,undefined);
 assert.equal(entry.balances,undefined);
});
test('el mapa público rechaza polígonos sin geometría y conserva estado comprado',()=>{
 assert.equal(validMapLot({id:'bad',points:[[1,2]]}),null);
 const sold=validMapLot({id:'AR-1',number:'1',block:'A',kind:'solar',available:false,
   points:[[0,0],[2,0],[2,2]]});
 assert.equal(sold.available,false);
});
test('los importes de la cotización se expresan en centavos',()=>{
 assert.equal(moneyCents(50000),5000000);
 assert.equal(moneyCents(85000.25),8500025);
});
test('la página pública exige selección y formulario; no incluye precios del administrador',()=>{
 const html=readFileSync(new URL('./cloudflare-pages/elegir-solar.html',import.meta.url),'utf8');
 assert.match(html,/Solicitar una cotización/);
 assert.match(html,/name="years"/);
 assert.match(html,/name="phone"/);
 assert.match(html,/map\.lots/);
 assert.ok(!html.includes('db.sales'));
});
