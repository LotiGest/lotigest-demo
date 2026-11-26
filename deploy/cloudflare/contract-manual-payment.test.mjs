import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {intakeCheckValues,intakePlanLots,contractIdentityFormat,contractIdentityDigits} from '../../contract-intake-core.mjs';
import {validate} from '../../functions/api/app/state.js';
import {validateNewMonthlyPayments} from '../../monthly-payment-rules.mjs';
import {validateNewReceiptCorrelativos} from '../../owner-payments.mjs';

const ui=readFileSync(new URL('./contract-intake-ui.js',import.meta.url),'utf8');
const saveSource=ui.slice(ui.indexOf('function contractIntakeData(form){'),ui.indexOf('function contractIntakeActivate('));
const manageSource=ui.slice(ui.indexOf('function contractManageRecord('),ui.indexOf("document.addEventListener('click',event=>{",ui.indexOf('function contractManageRecord(')));
if(!saveSource.includes('async function contractIntakeSave(')||!manageSource.includes('async function contractManageDeleteSave('))
 throw Error('No se pudo cargar el módulo de contratos.');
const form=fields=>({fields});
const InputFormData=class{constructor(f){return Object.entries(f.fields)}};
const fakeUuid=()=>{let id=0;return {randomUUID:()=>String(++id).padStart(8,'0')+'-0000-4000-8000-000000000000'}};

function fixture(){
 return {version:3,company:{},residences:[{id:'R',name:'Residencial de prueba'}],lots:[
  {id:'L1',residenceId:'R',stage:1,block:'A',sourceNumber:'1',area:170,areaVaras2:243,dimensions:{front:10,depth:17},status:'available',price:200000},
  {id:'L2',residenceId:'R',stage:2,block:'B',sourceNumber:'2',area:180,dimensions:{front:12,depth:15},status:'available',price:250000}
 ],clients:[],sales:[],payments:[],reservations:[],contractTexts:[]};
}
function setup(){
 let db=fixture(),writes=0;
 const queue={latest:JSON.stringify(db),confirmed:JSON.stringify(db),pending:null};
 const env={db,FormData:InputFormData,intakeCheckValues,intakePlanLots,contractIdentityFormat,contractIdentityDigits,
  contractIntakeWorking:{mode:'manual',residenceId:'R',file:null,values:{},busy:false},
  document:{addEventListener(){},getElementById:()=>({disabled:false,isConnected:true})},
  contractIntakeAdmin:()=>true,getLot:id=>db.lots.find(l=>l.id===id),getClient:id=>db.clients.find(c=>c.id===id),
  residence:()=>db.residences[0],activeReservation:()=>null,crypto:fakeUuid(),
  normalizeClientLookup:v=>String(v||'').replace(/[^A-Z0-9]/gi,'').toLowerCase(),
  businessToday:()=> '2026-11-20',buyerDate:v=>v,
  cloudWrite:raw=>{db=JSON.parse(raw);queue.latest=raw;writes++;},cloudFlush:async()=>{queue.confirmed=queue.latest;},
  cloudQueue:queue,cloudBlocked:false,cloudOffline:false,toast(){},closeModal(){},render(){}};
 const run=new Function(...Object.keys(env),saveSource+';return contractIntakeSave;')(...Object.values(env));
 const data={clientId:'',name:'CLIENTE FICTICIO',identity:'0801199000021',stage:'1',lotId:'L1',block:'A',number:'1',
  price:'200000',solarPrice_0:'200000',down:'50000',months:'84',date:'2026-11-01',firstDueDate:'2026-12-01',primaMethod:'Efectivo',
  observations:'SIN DATOS PERSONALES REALES'};
 return {run,data,db:()=>db,before:fixture(),writes:()=>writes,env};
}
test('nuevo contrato manual guarda medidas del inventario y no inventa pagos',async()=>{
 const x=setup();await x.run(form(x.data));
 const next=x.db();validate(next);validateNewMonthlyPayments(x.before,next);
 assert.equal(next.contractTexts[0].status,'pending-sale');
 assert.equal(next.sales.length,0);assert.equal(next.payments.length,0);
 assert.equal(next.lots[0].area,170);assert.equal(next.lots[0].dimensions.front,10);
 assert.equal(next.contractTexts[0].structured.date,'2026-11-01');
 assert.equal(x.writes(),1);
});
test('al marcar prima recibida crea una única venta y pago validado por el servidor',async()=>{
 const x=setup();Object.assign(x.data,{primaPaid:'on',primaDate:'2026-11-02',primaRef:'990001'});
 await x.run(form(x.data));const next=x.db();validate(next);validateNewMonthlyPayments(x.before,next);
 assert.equal(next.contractTexts[0].status,'active');
 assert.equal(next.sales.length,1);assert.equal(next.payments.length,1);
 assert.equal(next.sales[0].downPayment,50000);
 assert.equal(next.payments[0].amount,50000);
 assert.equal(next.payments[0].saleId,next.sales[0].id);
 assert.equal(next.contractTexts[0].saleId,next.sales[0].id);
 assert.equal(next.lots[0].area,170);
});
test('una sola ficha de dos solares registra primas separadas con el mismo recibo sin duplicarlo',async()=>{
 const x=setup();
 Object.assign(x.data,{price:'450000',down:'100000',primaPaid:'on',primaDate:'2026-11-02',primaRef:'990002',
  solarPrice_0:'200000',solarDown_0:'50000',extraLotId_0:'L2',extraStage_0:'2',solarPrice_1:'250000',solarDown_1:'50000'});
 await x.run(form(x.data));const next=x.db();validate(next);validateNewMonthlyPayments(x.before,next);
 assert.equal(next.contractTexts.length,2);assert.equal(next.sales.length,2);assert.equal(next.payments.length,2);
 assert.equal(next.payments.reduce((sum,p)=>sum+p.amount,0),100000);
 assert.equal(new Set(next.payments.map(p=>p.groupId)).size,1);
 assert.equal(new Set(next.payments.map(p=>p.receiptReference)).size,1);
 assert.equal(next.lots[0].area,170);assert.equal(next.lots[1].area,180);
});
test('si se marca prima recibida pero falta fecha de cobro se rechaza sin guardar',async()=>{
 const x=setup();x.data.primaPaid='on';
 await assert.rejects(x.run(form(x.data)),/fecha real de la prima/);
 assert.equal(x.writes(),0);
});
test('anular contrato retira venta y pago y conserva auditoría',async()=>{
 let db=fixture();db.clients.push({id:'C',name:'CLIENTE FICTICIO'});
 db.lots[0].ownerClientId='C';db.lots[0].status='sold';
 db.sales.push({id:'V',clientId:'C',lotId:'L1',type:'credit',price:200000,downPayment:50000,months:84,date:'2026-11-01'});
 db.payments.push({id:'P',saleId:'V',amount:50000,date:'2026-11-02',concept:'Prima'});
 db.contractTexts.push({id:'D',clientId:'C',lotId:'L1',residenceId:'R',saleId:'V',status:'active',format:'manual',structured:{down:50000}});
 const queue={latest:JSON.stringify(db),confirmed:JSON.stringify(db)};
 const env={db,FormData:InputFormData,contractIntakeAdmin:()=>true,cloudUser:{name:'ADMIN'},
  getLot:id=>db.lots.find(l=>l.id===id),getClient:id=>db.clients.find(c=>c.id===id),
  window:{lotigestConfirmAdminPin:async pin=>{assert.equal(pin,'1234');}},
  cloudWrite:raw=>{db=JSON.parse(raw);queue.latest=raw;},cloudFlush:async()=>{queue.confirmed=queue.latest;},
  cloudQueue:queue,cloudBlocked:false,cloudOffline:false,toast(){},closeModal(){},render(){}};
 const del=new Function(...Object.keys(env),manageSource+';return contractManageDeleteSave;')(...Object.values(env));
 await del(form({documentId:'D',confirmation:'ELIMINAR',reason:'Prueba controlada',pin:'1234'}));
 validate(db);
 assert.equal(db.contractTexts[0].status,'voided');
 assert.equal(db.sales.length,0);assert.equal(db.payments.length,0);
 assert.equal(db.lots[0].status,'available');assert.equal(db.lots[0].ownerClientId,undefined);
 assert.deepEqual(db.contractTexts[0].financialCancellation.paymentIds,['P']);
 assert.equal(db.lots[0].area,170);
});

test('anulación de un recibo compartido no modifica ningún contrato',()=>{
 const cancel=new Function(manageSource+';return contractCancelFinancialRecords;')();
 const state=fixture();state.clients.push({id:'C',name:'FICTICIO'});
 state.contractTexts.push({id:'D',clientId:'C',lotId:'L1',residenceId:'R',saleId:'V',status:'active'});
 state.sales.push({id:'V',clientId:'C',lotId:'L1'},{id:'V2',clientId:'C',lotId:'L2'});
 state.payments.push({id:'P',saleId:'V',groupId:'G',receiptReference:'7155',amount:100},{id:'P2',saleId:'V2',groupId:'G',receiptReference:'7155',amount:100});
 const before=JSON.stringify(state);
 assert.throws(()=>cancel(state,'D','ADMIN','Prueba','2026-11-26'),/recibo compartido/);
 assert.equal(JSON.stringify(state),before);
});
test('anulación previa libera correlativo y conserva pagos de otro solar',()=>{
 const cancel=new Function(manageSource+';return contractCancelFinancialRecords;')();
 const state=fixture();state.clients.push({id:'C',name:'FICTICIO'});
 state.contractTexts.push({id:'D',clientId:'C',lotId:'L1',residenceId:'R',saleId:'V',status:'voided'});
 state.sales.push({id:'V',clientId:'C',lotId:'L1'},{id:'V2',clientId:'C',lotId:'L2'});
 state.payments.push({id:'P',saleId:'V',receiptReference:'7155',amount:100},{id:'P2',saleId:'V2',receiptReference:'7156',amount:100});
 const next=cancel(state,'D','ADMIN','Prueba','2026-11-26');
 assert.deepEqual(next.payments.map(p=>p.receiptReference),['7156']);
 assert.deepEqual(next.contractTexts[0].financialCancellation.receiptRefs,['7155']);
 assert.equal(next.lots[0].status,'available');
 assert.equal(state.payments.length,2);
});

test('prima inicial exige correlativo numérico y no crea datos si falta',async()=>{
 for(const primaRef of ['', 'ABC-123']){
  const x=setup();Object.assign(x.data,{primaPaid:'on',primaDate:'2026-11-02',primaRef});
  await assert.rejects(x.run(form(x.data)),/correlativo numérico/);assert.equal(x.writes(),0);
 }
});
test('prima inicial no puede reutilizar un folio histórico con ceros iniciales',async()=>{
 const x=setup();x.env.db.historicalPayments=[{id:'H',sourceRaw:{folio:'0007155'}}];
 Object.assign(x.data,{primaPaid:'on',primaDate:'2026-11-02',primaRef:'7155'});
 await assert.rejects(x.run(form(x.data)),/historial de pagos/);assert.equal(x.writes(),0);
});
test('servidor rechaza una prima inicial sin correlativo o duplicada y acepta la válida',async()=>{
 const x=setup();Object.assign(x.data,{primaPaid:'on',primaDate:'2026-11-02',primaRef:'0007155'});
 await x.run(form(x.data));const next=x.db();validateNewReceiptCorrelativos(x.before,next);
 const invalid=JSON.parse(JSON.stringify(next));delete invalid.payments[0].receiptReference;
 assert.throws(()=>validateNewReceiptCorrelativos(x.before,invalid),/correlativo/);
 const dup={...x.before,historicalPayments:[{id:'H',receiptReference:'7155'}]};
 assert.throws(()=>validateNewReceiptCorrelativos(dup,{...next,historicalPayments:dup.historicalPayments}),/correlativo/);
});
