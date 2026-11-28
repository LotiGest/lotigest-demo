import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const historical=readFileSync(new URL('../deploy/cloudflare/historical-payment-modal-ui.js',import.meta.url),'utf8');
const exportsUI=readFileSync(new URL('../deploy/cloudflare/collection-fichas.js',import.meta.url),'utf8');
const extract=(source,start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b);};
const historyCode=extract(historical,' function clientPayments(form){',' function formatted(');
const exportCode=extract(exportsUI,'function collectionPaymentRows(','function paymentExcelBytes(');
function fixture(){
 const state={clients:[{id:'C1',name:'CLIENTE FICTICIO'}],lots:[{id:'L1',stage:1,block:'Z',sourceNumber:'92',residenceId:'R1'}],sales:[{id:'S1',lotId:'L1',clientId:'C1',type:'credit'}],payments:[],ownerPayments:[],ownershipStatements:[],historicalPayments:[]};
 const valid={clientId:'C1',residenceId:'R1',date:'2024-02-18',amountCents:10000,period:'2024-02'};
 for(const [id,flags] of [['good',{}],['voided',{status:'voided'}],['cancelled',{cancelledAt:'2026-11-27'}],['annulled',{status:'annulled'}],['deleted',{deletedAt:'2026-11-27'}],['status-cancelled',{status:'cancelled'}]]){
  state.payments.push({id:'P-'+id,saleId:'S1',date:valid.date,amount:100,...flags});
  state.ownerPayments.push({id:'O-'+id,...valid,...flags,allocations:[{amountCents:10000,references:[{lotId:'L1',stage:1,block:'Z',solar:'92'}]}]});
  state.historicalPayments.push({id:'H-'+id,...valid,...flags,lotId:'L1',block:'Z',lot:'92',type:'ABONO',issues:[]});
 }
 return state;
}
test('calendario histórico excluye recibos invalidados y conserva los registros originales',()=>{
 const state=fixture(),before=JSON.stringify(state);
 state.historicalPayments.push({id:'H-other',clientId:'C2',residenceId:'R1',lotId:'L1',date:'2024-02-18',amountCents:50000,issues:[]});
 const snapshot=JSON.stringify(state);
 const rows=new Function('db','residence','chosenLots','monthOf',historyCode+';return clientPayments;')(state,()=>({id:'R1'}),()=>[{id:'L1'}],p=>p.period)({dataset:{ownerClientId:'C1'}});
 assert.deepEqual(rows.map(r=>r.id),['O-good','H-good']);
 assert.equal(rows.reduce((n,r)=>n+r.amountCents,0),20000);
 assert.equal(JSON.stringify(state),snapshot);
 assert.notEqual(snapshot,before);
});
test('exportación excluye recibos invalidados de ventas, fichas e historial sin borrar datos',()=>{
 const state=fixture(),before=JSON.stringify(state);
 const env={db:state,collectionStage:'all',collectionStageFilter:'all',getLot:id=>state.lots.find(l=>l.id===id),getClient:id=>state.clients.find(c=>c.id===id),residenceName:()=> 'Residencial ficticia',lotigestLedger:{historyIssueLabels:{}}};
 const rows=new Function(...Object.keys(env),exportCode+';return collectionPaymentRows;')(...Object.values(env))(true);
 assert.deepEqual(rows.map(r=>r[10]).sort(),['H-good','O-good','P-good']);
 assert.equal(rows.reduce((n,r)=>n+r[8],0),300);
 assert.equal(JSON.stringify(state),before);
});
