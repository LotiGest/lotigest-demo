import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reconcileInstallments} from '../installment-status.mjs';
const addon=readFileSync(new URL('../deploy/cloudflare/payment-batch-ui.js',import.meta.url),'utf8');
const original=readFileSync(new URL('../prueba-diseno-v08.html',import.meta.url),'utf8');
const modern=readFileSync(new URL('../deploy/cloudflare/payment-modal-ui.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../deploy/cloudflare/payment-modal.css',import.meta.url),'utf8');
const build=readFileSync(new URL('../deploy/cloudflare/build.mjs',import.meta.url),'utf8');

function manualScenario(){
 const payments=[],cloudSnapshots=[],messages=[],listeners={};
 const db={sales:[{id:'S1',lotId:'L1',clientId:'C1',residenceId:'R',price:150000,downPayment:50000}],
  payments:[],ownerPayments:[]};
 let serial=0;
 const money=n=>'L '+Number(n).toFixed(2);
 const draft={residenceId:'R',clientId:'C1',amounts:{S1:'19500'},snapshot:JSON.stringify(db),stored:null};
 const form={id:'multi-payment-form',isConnected:true,elements:{date:{value:'2026-11-20'},concept:{value:'Abono a crédito'}},
  fakeData:{date:'2026-11-18',concept:'Adelanto noviembre',method:'Efectivo'}};
 const env={
  db,paymentDraft:draft,ownerPaymentDraft:null,
  document:{addEventListener:(type,fn)=>(listeners[type]??=[]).push(fn),
   getElementById:()=>({textContent:''}),querySelector:()=>null},
  showModal:()=>null,submitMultiPayment:()=>{throw Error('No debe abrir formulario clásico')},
  submitOwnerAbono:async()=>{},localStorage:{getItem:()=>null},
  STORAGE:'lotigest_test',FormData:class{
   constructor(f){this.f=f;}*[Symbol.iterator](){yield* Object.entries(this.f.fakeData);}
  },
  planMultiPayment:(active,data)=>Object.entries(active.amounts).map(([saleId,amount])=>{
   if(!(Number(amount)>0))throw Error('Monto inválido');
   return {saleId,amount:Number(amount)};
  }),
  uid:prefix=>prefix+'-'+(++serial),getSale:id=>db.sales.find(s=>s.id===id),
  paidAmount:id=>db.payments.filter(p=>p.saleId===id).reduce((t,p)=>t+p.amount,0)+50000,
  balance:s=>s.price-(db.payments.filter(p=>p.saleId===s.id).reduce((t,p)=>t+p.amount,0)+50000),
  buildReceiptInfo:(payment,previous)=>({allocations:[{label:'Cuota 1',number:1,amount:payment.amount}],previous}),
  cloudWrite:s=>cloudSnapshots.push(JSON.parse(s)),businessToday:()=> '2026-11-20',
  renderPaymentSelected:()=>{},renderPaymentResults:()=>{},pmRepaintSales:()=>{},
  toast:m=>messages.push(m),money,
  openOwnerAbono:()=>{},cloudFlush:async()=>{},cloudBlocked:false,
  lotigestOwnerPayments:{createOwnerPayment:()=>{}},
  crypto:{randomUUID:()=> 'test'},console
 };
 const api=new Function(...Object.keys(env),addon+
  ';return {submitMultiPayment,submitOwnerAbono,setContinue:(x)=>pmBatchContinue=x,'+
  'getPayments:()=>db.payments,receipts:()=>pmBatchReceipts,getDraft:()=>paymentDraft};')(...Object.values(env));
 return {api,form,draft,cloudSnapshots,messages,db,listeners};
}
test('sin salir, registra pagos sucesivos con fechas distintas y folios únicos',()=>{
 const {api,form,cloudSnapshots}=manualScenario();
 api.setContinue(true);api.submitMultiPayment(form);
 assert.equal(api.getPayments().length,1);
 assert.equal(api.getPayments()[0].date,'2026-11-18');
 assert.equal(api.getDraft().amounts.S1,'');
 assert.equal(form.elements.date.value,'2026-11-20');
 assert.equal(api.receipts().length,1);
 const first=api.getPayments()[0].id;
 api.getDraft().amounts.S1='2500';
 form.fakeData.date='2026-11-19';
 api.setContinue(true);api.submitMultiPayment(form);
 assert.equal(api.getPayments().length,2);
 assert.equal(api.getPayments()[0].date,'2026-11-19');
 assert.notEqual(api.getPayments()[0].id,first);
 assert.equal(api.receipts().length,2);
 assert.equal(cloudSnapshots.length,2);
 assert.equal(api.getPayments().reduce((n,p)=>n+p.amount,0),22000);
});

test('monto vacío después de guardar no puede duplicar el abono',()=>{
 const {api,form,cloudSnapshots}=manualScenario();
 api.setContinue(true);api.submitMultiPayment(form);
 api.setContinue(true);api.submitMultiPayment(form);
 assert.equal(api.getPayments().length,1);
 assert.equal(cloudSnapshots.length,1);
});

test('adelanto L 19,500 se aplica a siete cuotas y una cuota parcial, no a la prima',()=>{
 const start=original.indexOf('function receiptAllocation(');
 const end=original.indexOf('function receiptNextDate(',start);
 assert.ok(start>0&&end>start);
 const addMonths=(s,k)=>{
  const d=new Date(s+'T12:00:00Z'),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+k);
  const max=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
  d.setUTCDate(Math.min(day,max));return d;
 };
 const dateKey=d=>d.toISOString().slice(0,10);
 const receiptAllocation=new Function('installmentDueCents','addMonths','dateKey',
  original.slice(start,end)+';return receiptAllocation;')(()=>250000,addMonths,dateKey);
 const s={id:'S1',date:'2026-01-01',firstDueDate:'2026-12-26',type:'credit',
  price:150000,downPayment:50000,months:40};
 const allocations=receiptAllocation(s,50000,19500);
 assert.equal(allocations.length,8);
 assert.deepEqual(allocations.slice(0,7).map(a=>a.amount),Array(7).fill(2500));
 assert.equal(allocations[7].amount,2000);
 const record={id:'RC1',saleId:'S1',date:'2026-11-20',amount:19500,receiptInfo:{allocations}};
 const {rows}=reconcileInstallments([s],[record],'2026-11-20',()=>250000,(date,idx)=>dateKey(addMonths(date,idx)));
 assert.equal(rows.filter(r=>r.status==='advance-covered').length,7);
 assert.equal(rows.filter(r=>r.status==='advance').length,1);
 assert.equal(rows.filter(r=>r.status==='late').length,0);
 assert.equal(rows[7].remainingCents,50000);
});

test('calendario en verde para adelantos completos y rojo para vencidas, no futuros',()=>{
 assert.match(css,/\.pm-month\.advance-covered\{background:#d9f4dd!important/);
 assert.match(modern,/const hasOverdue=inMonth\.some/);
 assert.match(modern,/hasOverdue\?'late'/);
 assert.match(modern,/verde con ✓: cuota cubierta con adelanto/i);
 assert.match(build,/payment-batch-ui\.js/);
 assert.match(addon,/dataset\.pmBatchPdf=record\.id/);
 assert.match(addon,/factura fiscal/i);
});


test('abonos de fichas: guarda un recibo independiente y conserva el cliente en la ventana',async()=>{
 const initial={sales:[],payments:[],ownerPayments:[]};
 let number=0;
 const registered=[],opened=[];
 const form={id:'owner-abono-form',isConnected:true,
  elements:{period:{dataset:{pmPeriodEdited:'false'},value:'2026-11'},date:{value:'2026-11-20'}},
  fakeData:{date:'2026-11-18',method:'Efectivo',concept:'Abono a solar',reviewed:'on',period:'2026-11'},
  querySelectorAll:()=>[{value:'19500',dataset:{ownerStatement:'O1',ownerReference:'group'}}]};
 const draft={id:'OP0',clientId:'C1',residenceId:'R1',snapshot:JSON.stringify(initial)};
 const environment={
  db:initial,paymentDraft:null,ownerPaymentDraft:draft,
  document:{addEventListener(){},querySelector(){return null},getElementById(){return null}},
  showModal:()=>null,submitMultiPayment:()=>{},submitOwnerAbono:async()=>{},
  FormData:class{constructor(f){this.form=f;}*[Symbol.iterator](){yield* Object.entries(this.form.fakeData);}},
  lotigestOwnerPayments:{createOwnerPayment:(db,data)=>{
   const receipt={id:'OP-'+(++number),date:data.date,amountCents:1950000};
   return {receipt,state:{...db,ownerPayments:[receipt,...db.ownerPayments]}};
  }},
  cloudWrite:raw=>registered.push(JSON.parse(raw)),cloudFlush:async()=>{},
  cloudBlocked:false,
  openOwnerAbono:(id,residenceId)=>opened.push([id,residenceId]),
  money:n=>'L '+n,toast:()=>{}
 };
 const api=new Function(...Object.keys(environment),addon+
  ';return {submitOwnerAbono,setContinue:value=>pmBatchContinue=value,receipts:()=>pmBatchReceipts,getDb:()=>db};')
  (...Object.values(environment));
 api.setContinue(true);await api.submitOwnerAbono(form);
 assert.deepEqual(opened,[['C1','R1']]);
 assert.equal(registered.length,1);
 assert.equal(api.getDb().ownerPayments.length,1);
 assert.equal(api.receipts()[0].kind,'owner');
 assert.equal(api.receipts()[0].date,'2026-11-18');
 assert.equal(api.receipts()[0].id,'OP-1');
});
