import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditUncontractedSales,removeUncontractedSales} from '../uncontracted-sales-cleanup.mjs';

const ui=readFileSync(new URL('../deploy/cloudflare/lot-contract-first-ui.js',import.meta.url),'utf8');
const build=readFileSync(new URL('../deploy/cloudflare/build.mjs',import.meta.url),'utf8');

function state(){
 return {
  residences:[{id:'R',name:'Altos del Arrayán'}],
  lots:[
   {id:'L1',residenceId:'R',stage:1,block:'B',sourceNumber:'12',status:'sold',price:200000,area:200,ownerClientId:'C1'},
   {id:'L2',residenceId:'R',stage:2,block:'B',sourceNumber:'12',status:'sold',price:210000,area:220,ownerClientId:'C2'},
   {id:'L3',residenceId:'R',stage:2,block:'C',sourceNumber:'5',status:'sold',ownerClientId:'C3'}
  ],
  clients:[{id:'C1',name:'Ana SIN contrato'},{id:'C2',name:'Carlos CON contrato'},{id:'C3',name:'Rosa con abonos'}],
  sales:[
   {id:'S1',lotId:'L1',clientId:'C1',date:'2026-10-01',type:'credit',openingPaid:0},
   {id:'S2',lotId:'L2',clientId:'C2',date:'2026-10-02',type:'credit'},
   {id:'S3',lotId:'L3',clientId:'C3',date:'2026-10-03',type:'credit'}
  ],
  contractTexts:[{id:'DOC2',residenceId:'R',status:'active',clientId:'C2',saleId:'S2',contractLotIds:['L2']}],
  payments:[{id:'P3',saleId:'S3',date:'2026-11-20',amount:2500}],
  reservations:[],ownerPayments:[],historicalPayments:[],historicalContracts:[],ownershipStatements:[]
 };
}
test('auditoría separa compras sin contrato sin movimientos de compras protegidas',()=>{
 const db=state(),audit=auditUncontractedSales(db,'R');
 assert.deepEqual(audit.candidates.map(x=>x.saleId),['S1']);
 assert.deepEqual(audit.protectedSales.map(x=>x.saleId),['S2','S3']);
 assert.match(audit.protectedSales[0].reason,/documento contractual/);
 assert.match(audit.protectedSales[1].reason,/abonos o recibos/);
});
test('solo elimina compra elegible; conserva persona, solar, precios, etapa y contratos',()=>{
 const db=state(),before=JSON.stringify(db);
 const result=removeUncontractedSales(db,['S1'],'R'),next=result.state;
 assert.equal(JSON.stringify(db),before);
 assert.equal(next.sales.length,2);
 assert.ok(!next.sales.find(s=>s.id==='S1'));
 assert.equal(next.clients.length,3);
 assert.equal(next.lots.length,3);
 assert.equal(next.lots[0].status,'available');
 assert.equal(next.lots[0].ownerClientId,undefined);
 assert.equal(next.lots[0].price,200000);
 assert.equal(next.lots[0].area,200);
 assert.equal(next.lots[0].stage,1);
 assert.equal(next.lots[1].status,'sold');
 assert.equal(next.payments[0].saleId,'S3');
 assert.equal(next.contractTexts[0].saleId,'S2');
});
test('protege pagos, saldos de apertura, contratos pendientes, fichas, apartados y otros residenciales',()=>{
 const db=state();
 assert.throws(()=>removeUncontractedSales(db,['S2'],'R'),/respaldo/);
 assert.throws(()=>removeUncontractedSales(db,['S3'],'R'),/respaldo/);
 db.sales[0].openingPaid=30000;
 assert.equal(auditUncontractedSales(db,'R').candidates.length,0);
 db.sales[0].openingPaid=0;
 db.reservations.push({id:'A1',lotId:'L1',status:'active'});
 assert.equal(auditUncontractedSales(db,'R').candidates.length,0);
 db.reservations=[];
 db.ownershipStatements.push({clientId:'C1',residenceId:'R',references:[{lotId:'L1'}]});
 assert.equal(auditUncontractedSales(db,'R').candidates.length,0);
 db.ownershipStatements=[];
 db.lots[0].pendingContractId='PEND';
 assert.equal(auditUncontractedSales(db,'R').candidates.length,0);
 db.lots[0].pendingContractId=null;
 assert.equal(auditUncontractedSales(db,'OTHER').candidates.length,0);
 assert.throws(()=>removeUncontractedSales(db,['S1'],'OTHER'),/respaldo/);
});
test('no se aceptan selecciones duplicadas ni superiores a 20',()=>{
 const db=state();
 assert.throws(()=>removeUncontractedSales(db,['S1','S1'],'R'),/inválidos/);
 assert.throws(()=>removeUncontractedSales(db,[],'R'),/entre 1 y 20/);
 assert.throws(()=>removeUncontractedSales(db,Array(21).fill('S1'),'R'),/entre 1 y 20/);
});
test('Terrenos solo muestra titular con contrato y no el comprador sin ficha contractual',()=>{
 const db=state(),events={};
 const environment={
  db,document:{addEventListener:(kind,cb)=>{(events[kind]??=[]).push(cb)},querySelector:()=>null},
  buyerInventorySummary:()=>'',lotsPage:()=>'<th>Comprador / compra</th><button class="btn btn-outline" data-action="buyer-import">Importar Excel de compradores</button><div class="page-cols"></div>',
  editLot:()=>{},openSolarWindow:()=>{},
  auditOrphanOwnerLinks:()=>({candidates:[]}),auditUncontractedSales,
  cloudUser:{role:'admin'},residence:()=>({id:'R'}),esc:s=>String(s),getClient:id=>db.clients.find(c=>c.id===id)
 };
 const fn=new Function(...Object.keys(environment),ui+';return {buyerInventorySummary,lotsPage};');
 const result=fn(...Object.values(environment));
 const missing=result.buyerInventorySummary(db.lots[0]);
 const present=result.buyerInventorySummary(db.lots[1]);
 assert.match(missing,/Sin contrato/);
 assert.doesNotMatch(missing,/Ana SIN contrato/);
 assert.match(present,/Carlos CON contrato/);
 assert.match(present,/Contrato activo/);
 const html=result.lotsPage();
 assert.match(html,/Contrato \/ titular/);
 assert.doesNotMatch(html,/Importar Excel de compradores/);
 assert.match(html,/data-lot-go-contracts/);
 assert.match(html,/data-lot-uncontracted-open/);
 assert.match(html,/data-owner-cleanup-open/);
});
test('Bloquea compradores y compras directas desde Terrenos, mantiene apartados',()=>{
 assert.match(ui,/option\.value\)\)option\.remove/);
 assert.match(ui,/['"]cash['"],['"]credit['"]/);
 assert.match(ui,/event\.target\.id==='solar-form'/);
 assert.match(ui,/Compradores y contratos/);
 assert.match(ui,/data-action="buyer-history"/);
 assert.match(ui,/data-lot-uncontracted-backup/);
 assert.match(ui,/contractIntakeAdmin\(\)/);
 assert.match(ui,/confirm\('¿Retirar/);
 assert.match(build,/uncontracted-sales-cleanup\.mjs/);
 assert.match(build,/lot-contract-first-ui\.js/);
});
