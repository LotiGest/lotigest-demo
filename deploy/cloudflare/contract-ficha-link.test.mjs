import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./contract-ficha-link-ui.js',import.meta.url),'utf8');
function mock(){
 const client={id:'C1',name:'CLIENTE FICTICIO',identity:'0801 1990 00021'};
 const lot={id:'G16',status:'available',stage:2,block:'G',sourceNumber:'16',area:176,ownerClientId:'C1',pendingContractId:'D1'};
 const doc={id:'D1',format:'photo+ocr',status:'pending-sale',clientId:'C1',lotId:'G16',structured:{name:'CLIENTE FICTICIO',identity:client.identity,price:580564.16,down:58056.42,block:'G',number:'16',north:'CALLE',south:'G-3'}};
 const db={clients:[client],lots:[lot],sales:[],contractTexts:[doc]};
 const captured=[],root={insertAdjacentHTML:(_where,html)=>captured.push(html)},footer={insertAdjacentHTML:(_where,html)=>captured.push(html)};
 const document={addEventListener:()=>{},querySelector:q=>q.includes('modal-content')?root:q.includes('modal-footer')?footer:null,getElementById:()=>null};
 const mocks={db,getClient:id=>db.clients.find(c=>c.id===id),getLot:id=>db.lots.find(l=>l.id===id),esc:s=>String(s),money:n=>'L '+Number(n).toFixed(2),
  buyerInventorySummary:()=>'<span>Sin comprador</span>',inventoryInfo:()=>'<div>Medidas existentes</div>',
  viewClient:()=>{},viewLot:()=>{},openSolarWindow:()=>{},planSolarAction:()=>({ok:true}),planBuyerHistory:()=>({ok:true}),
  contractIntakeDescription:()=>'<p>Ficha completa: Norte CALLE; precio pactado; 84 cuotas</p>',viewContractText:()=>{},contractIntakeOpen:()=>{} ,document};
 const names=Object.keys(mocks),app=new Function(...names,source+';return {buyerInventorySummary,inventoryInfo,viewClient,viewLot,openSolarWindow,planSolarAction,planBuyerHistory};')(...Object.values(mocks));
 return {app,db,lot,doc,captured};
}
test('El propietario del contrato pendiente aparece en el inventario antes de activar crédito',()=>{
 const {app,lot}=mock();
 assert.match(app.buyerInventorySummary(lot),/CLIENTE FICTICIO/);
 assert.match(app.buyerInventorySummary(lot),/Pendiente de activar crédito/);
 assert.match(app.inventoryInfo(lot),/CLIENTE FICTICIO/);
 assert.match(app.inventoryInfo(lot),/580564\.16/);
});
test('Ficha del cliente y ficha del terreno muestran la descripción, sin una venta ficticia',()=>{
 const {app,captured}=mock();
 app.viewClient('C1');app.viewLot('G16');
 assert.ok(captured.some(x=>x.includes('Ficha completa')));
 assert.ok(captured.some(x=>x.includes('Completar ficha desde contrato')));
 assert.ok(captured.some(x=>x.includes('Pendiente de activar crédito')));
});
test('No permite vender ni importar nuevamente un solar con contrato pendiente',()=>{
 const {app,lot}=mock();
 assert.throws(()=>app.planSolarAction({lotId:'G16',operation:'credit'}),/ya está vinculado a un contrato/);
 assert.throws(()=>app.planBuyerHistory({lotId:'G16'},lot),/ficha contractual/);
});