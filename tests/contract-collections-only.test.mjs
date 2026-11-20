import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {contractCollectionsScope} from '../contract-collections-scope.mjs';
const ui=readFileSync(new URL('../deploy/cloudflare/contract-collections-only-ui.js',import.meta.url),'utf8');
const build=readFileSync(new URL('../deploy/cloudflare/build.mjs',import.meta.url),'utf8');

function original(){
 return {
  lots:[
   {id:'L1',residenceId:'R',stage:1,block:'B',sourceNumber:'12',ownerClientId:'OLD',price:200000,area:200,status:'sold'},
   {id:'L2',residenceId:'R',stage:2,block:'B',sourceNumber:'12',ownerClientId:'NEW',price:210000,area:220,status:'sold'},
   {id:'L3',residenceId:'R2',stage:1,block:'C',sourceNumber:'2',price:180000,status:'sold'}
  ],
  clients:[{id:'OLD',name:'Cliente antiguo de Excel'},{id:'NEW',name:'Nuevo cliente desde Contratos'},{id:'X',name:'Otra residencial'}],
  sales:[
   {id:'S-OLD',lotId:'L1',clientId:'OLD',date:'2025-02-01',type:'credit'},
   {id:'S-NEW',lotId:'L2',clientId:'NEW',date:'2026-11-20',type:'credit',documentId:'CM-1',source:'contract-intake'},
   {id:'S-X',lotId:'L3',clientId:'X',date:'2026-02-01',type:'credit'}
  ],
  payments:[
   {id:'P-OLD',saleId:'S-OLD',date:'2025-03-01',amount:2500},
   {id:'P-NEW',saleId:'S-NEW',date:'2026-11-20',amount:3000},
   {id:'P-VOID',saleId:'S-NEW',date:'2026-11-19',amount:3000,voidedAt:'2026-11-20'},
   {id:'P-X',saleId:'S-X',date:'2026-03-01',amount:2500}
  ],
  contractTexts:[
   {id:'CM-1',lotId:'L2',clientId:'NEW',residenceId:'R',status:'active',saleId:'S-NEW'},
   {id:'CM-X',lotId:'L3',clientId:'X',residenceId:'R2',status:'active',saleId:'S-X'}
  ],
  historicalContracts:[{id:'H-1',clientId:'OLD',residenceId:'R',lotId:'L1'}],
  historicalPayments:[{id:'H-2',clientId:'OLD',residenceId:'R',date:'2024-01-01',amountCents:100000}],
  ownershipStatements:[{id:'O-1',clientId:'OLD',residenceId:'R',references:[{lotId:'L1'}]}],
  ownerPayments:[{id:'OP-1',clientId:'OLD',residenceId:'R',date:'2025-03-01',amountCents:300000}],
  reservations:[{id:'RS-1',lotId:'L1',status:'active'}],
  residences:[{id:'R',name:'Altos del Arrayán'},{id:'R2',name:'Otra'}]
 };
}
test('no se muestran clientes, pagos ni solares antiguos sin contrato',()=>{
 const state=original(),snapshot=JSON.stringify(state),scope=contractCollectionsScope(state,'R');
 assert.deepEqual(scope.lots.map(l=>l.id),['L2']);
 assert.deepEqual(scope.clients.map(c=>c.id),['NEW']);
 assert.deepEqual(scope.sales.map(s=>s.id),['S-NEW']);
 assert.deepEqual(scope.payments.map(p=>p.id),['P-NEW']);
 assert.deepEqual(scope.ownershipStatements,[]);
 assert.deepEqual(scope.historicalPayments,[]);
 assert.deepEqual(scope.ownerPayments,[]);
 assert.equal(JSON.stringify(state),snapshot,'No debe borrar ni mutar registros reales');
});
test('sin ningún contrato la pantalla queda vacía aunque haya inventario e importaciones',()=>{
 const state=original();state.contractTexts=[];
 const scope=contractCollectionsScope(state,'R');
 assert.equal(scope.lots.length,0);
 assert.equal(scope.clients.length,0);
 assert.equal(scope.sales.length,0);
 assert.equal(scope.payments.length,0);
 assert.equal(state.lots.length,3);
 assert.equal(state.historicalPayments.length,1);
});
test('ficha desde Contratos sin prima aparece como pendiente, no inventa venta ni abono',()=>{
 const state=original();state.contractTexts=[{id:'CM-PEND',clientId:'NEW',lotId:'L2',residenceId:'R',status:'pending-sale'}];
 const scope=contractCollectionsScope(state,'R');
 assert.equal(scope.lots.length,1);
 assert.equal(scope.clients[0].id,'NEW');
 assert.equal(scope.sales.length,0);
 assert.equal(scope.payments.length,0);
 assert.equal(scope.contractTexts[0].status,'pending-sale');
});
test('no se mezcla un mismo número de solar de otra etapa o residencial',()=>{
 const state=original();
 state.contractTexts.push({id:'CM-WRONG',clientId:'OLD',lotId:'L1',residenceId:'R2',status:'active'});
 state.contractTexts.push({id:'CM-VOID',clientId:'OLD',lotId:'L1',residenceId:'R',status:'voided'});
 const scope=contractCollectionsScope(state,'R');
 assert.deepEqual(scope.lots.map(l=>l.id),['L2']);
 assert.equal(scope.lots[0].stage,2);
 assert.equal(scope.lots[0].sourceNumber,'12');
 assert.ok(!scope.lots.some(l=>l.id==='L1'));
});
test('la ficha de varios solares no asigna por error los demás sin su propia ficha',()=>{
 const state=original();
 state.contractTexts[0].contractLotIds=['L1','L2'];
 const scope=contractCollectionsScope(state,'R');
 assert.deepEqual(scope.lots.map(l=>l.id),['L2']);
 assert.deepEqual(scope.clients.map(c=>c.id),['NEW']);
});
test('un contrato vinculado a venta de otra persona no se considera confirmado',()=>{
 const state=original();
 state.contractTexts[0].clientId='OLD';
 const scope=contractCollectionsScope(state,'R');
 assert.equal(scope.lots.length,0);
 assert.equal(scope.payments.length,0);
});
test('UI conserva la base completa y filtra reportes y exportaciones',()=>{
 const state=original(),events={};
 let db=state;
 const environment={
  contractCollectionsScope,
  db,
  residence:()=>({id:'R'}),document:{addEventListener:(name,fn)=>{(events[name]??=[]).push(fn);}},
  collectionPage:()=>'<div class="cards-four">Lotes: '+db.lots.length+'</div><button data-action="ledger-import">Importar Excel de pagos</button>',
  ordinaryCollectionCard:()=>'<article>Anterior</article>',
  collectionPaymentRows:()=>db.payments.map(p=>p.id),
  collectionClientRows:()=>db.clients.map(c=>c.id),
  debtReport:()=>db.sales.map(s=>s.id),
  esc:v=>String(v),getClient:id=>db.clients.find(c=>c.id===id),
  inventoryArea:l=>l.area,inventoryPrice:l=>'L '+l.price,
  page:'collections',render:()=>{},contractIntakeOpen:()=>{}
 };
 // JavaScript compilation scope uses db as a parameter so the state must be
 // observed through its returned closure, not the outer test variable.
 const api=new Function(...Object.keys(environment),ui+
  ';return {collectionPage,collectionPaymentRows,collectionClientRows,debtReport,ordinaryCollectionCard,current:()=>db};')(...Object.values(environment));
 const html=api.collectionPage();
 assert.match(html,/Clientes y solares desde Contratos/);
 assert.match(html,/Lotes: 1/);
 assert.doesNotMatch(html,/data-action="ledger-import"/);
 assert.deepEqual(api.collectionPaymentRows(),['P-NEW']);
 assert.deepEqual(api.collectionClientRows(),['NEW']);
 assert.deepEqual(api.debtReport(),['S-NEW']);
 assert.equal(api.current(),state);
 assert.match(api.ordinaryCollectionCard({lot:state.lots[0]}),/Anterior/);
 assert.match(build,/contract-collections-scope\.mjs/);
 assert.match(build,/contract-collections-only-ui\.js/);
});
