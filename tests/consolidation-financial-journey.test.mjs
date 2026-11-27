import test from 'node:test';
import assert from 'node:assert/strict';
import {monthlyPaymentInfo,planAutomaticClientPayment,partialPaymentDetails,makePartialPaymentConfirmation,validateNewMonthlyPayments} from '../monthly-payment-rules.mjs';
import {reconcileInstallments} from '../installment-status.mjs';
const actor='admin', options={partialActor:actor};
const initial=()=>({clients:[{id:'C'}],lots:[{id:'L',residenceId:'R'}],sales:[{id:'S',lotId:'L',clientId:'C',type:'credit',price:120000,downPayment:20000,months:10,date:'2026-01-01',firstDueDate:'2026-02-01'}],payments:[],ownerPayments:[]});
const clone=x=>JSON.parse(JSON.stringify(x));
const amounts=[20000,30000,15000,9000], dates=['2026-02-01','2026-03-01','2026-04-01','2026-05-01'];
const month=(d,i)=>{const x=new Date(d+'T12:00:00Z');x.setUTCMonth(x.getUTCMonth()+i);return x.toISOString().slice(0,10);};
function payment(state,amount,date,id,note){
 const plan=planAutomaticClientPayment(state,['S'],amount*100,date),a=plan.allocations[0];
 const p={...a,id,receiptReference:String(100+Number(id.slice(1))),date,concept:a.concept||'Abono mensual'};
 const detail=partialPaymentDetails(state,['L'],a.cents,{prima:a.paymentApplication==='prima'});
 if(detail&&note!==undefined)p.partialPaymentConfirmation=makePartialPaymentConfirmation(detail,{date,actor,note});
 return p;
}
test('recorrido financiero individual y por fechas: L 74,000 sin prima y cuota intacta',()=>{
 const start=initial(),withPrima=clone(start);withPrima.payments.push(payment(start,20000,'2026-01-01','P0'));
 validateNewMonthlyPayments(start,withPrima,options);
 for(const note of ['', 'Pago parcial autorizado']){
  let state=clone(withPrima);
  for(let i=0;i<amounts.length;i++){
   const before=clone(state),p=payment(before,amounts[i],dates[i],'P'+(i+1),i===3?note:undefined);
   if(i===3){
    const unconfirmed={...p};delete unconfirmed.partialPaymentConfirmation;
    assert.throws(()=>validateNewMonthlyPayments(before,{...before,payments:[unconfirmed,...before.payments]},options),/Confirma/);
    for(const tampered of [{amountCents:899999},{actor:'otro'},{date:'2026-05-02'}]){
     assert.throws(()=>validateNewMonthlyPayments(before,{...before,payments:[{...p,partialPaymentConfirmation:{...p.partialPaymentConfirmation,...tampered}},...before.payments]},options),/Confirma/);
    }
    const fakePrima={...unconfirmed,concept:'Prima'};
    assert.throws(()=>validateNewMonthlyPayments(before,{...before,payments:[fakePrima,...before.payments]},options),/prima pendiente/);
    assert.equal(JSON.stringify(state),JSON.stringify(before));
   }
   state={...before,payments:[p,...before.payments]};validateNewMonthlyPayments(before,state,options);
  }
  validateNewMonthlyPayments(start,state,options);
  assert.equal(state.payments.filter(p=>p.paymentApplication!=='prima').reduce((n,p)=>n+p.amount,0),74000);
  assert.equal(monthlyPaymentInfo(state,['L']).monthlyCents,1000000);
  assert.equal(monthlyPaymentInfo(state,['L']).remainingCents,2600000);
  assert.equal(state.payments[0].partialPaymentConfirmation.differenceCents,100000);
  assert.equal(state.payments[0].partialPaymentConfirmation.note,note);
  const restored=clone(state);validateNewMonthlyPayments(state,restored,options);
  restored.payments[0].partialPaymentConfirmation.note='manipulado';
  assert.throws(()=>validateNewMonthlyPayments(state,restored,options),/original/);
  const ledger=reconcileInstallments(state.sales,state.payments,'2026-05-31',()=>1000000,month,{requireReference:true,repairExplicitAbonos:true});
  assert.equal(ledger.rows.reduce((n,r)=>n+r.appliedCents,0),7400000);
  assert.equal(ledger.rows.filter(r=>r.remainingCents===0).length,7);
  assert.equal(ledger.rows[7].remainingCents,600000);
  assert.ok(ledger.rows.reduce((n,r)=>n+r.advanceCents,0)>0);
 }
});
test('históricos de propietario con ficha conocida: prima, cuatro abonos y confirmación por recibo',()=>{
 const start={clients:[{id:'C'}],lots:[{id:'L',residenceId:'R'}],sales:[],payments:[],contractTexts:[{lotId:'L',format:'manual',status:'pending-sale',structured:{price:120000,down:20000,months:10}}],ownershipStatements:[{id:'D',clientId:'C',residenceId:'R',references:[{lotId:'L'}]}],ownerPayments:[]};
 let state=clone(start);
 for(const [i,amount] of [20000,...amounts].entries()){
  const date=i?dates[i-1]:'2026-01-01',a={statementId:'D',referenceIndex:null,amountCents:amount*100,references:[{lotId:'L'}]};
  const p={id:'O'+i,date,concept:i?'Abono histórico':'Prima histórica',amountCents:amount*100,allocations:[a]};
  if(i===4){
   assert.throws(()=>validateNewMonthlyPayments(state,{...state,ownerPayments:[p,...state.ownerPayments]},options),/Confirma/);
   const fake=clone(p);fake.allocations[0].references[0].lotId=null;
   assert.throws(()=>validateNewMonthlyPayments(state,{...state,ownerPayments:[fake,...state.ownerPayments]},options),/no coinciden/);
   a.partialPaymentConfirmation=makePartialPaymentConfirmation(partialPaymentDetails(state,['L'],amount*100),{actor,date,note:'Histórico'});
  }
  const next={...state,ownerPayments:[p,...state.ownerPayments]};validateNewMonthlyPayments(state,next,options);state=next;
 }
 validateNewMonthlyPayments(start,state,options);
 assert.equal(state.ownerPayments.filter(p=>!/^Prima/.test(p.concept)).reduce((n,p)=>n+p.amountCents,0),7400000);
 assert.equal(monthlyPaymentInfo(state,['L']).remainingCents,2600000);
 assert.equal(monthlyPaymentInfo(state,['L']).monthlyCents,1000000);
});
