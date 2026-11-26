import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {contractCollectionsScope} from '../contract-collections-scope.mjs';
const src=readFileSync(new URL('../deploy/cloudflare/contract-collections-only-ui.js',import.meta.url),'utf8');
const code=src.slice(src.indexOf(' let ccModels=new Map()'),src.indexOf(' function ccMatch(g){'));
test('Cobros reutiliza amortizaciones exactas y recalcula solo clientes modificados',()=>{
 let calls=0,day='2026-11-26';
 const groups=new Function('contractCollectionsScope','ccKey','ccModel','businessToday','cloudUser',code+';return ccGroups;')(
 contractCollectionsScope,(r,id)=>JSON.stringify([r,id]),(s,id,r,asOf,prepared)=>{calls++;return {m:{paid:prepared.scope.payments.reduce((n,p)=>n+p.amount,0),date:asOf}};},()=>day,{name:'QA'});
 const state={residences:[{id:'R',name:'Prueba'}],company:{},clients:[],lots:[],sales:[],payments:[],contractTexts:[],historicalPayments:[]};
 for(let i=0;i<100;i++){
  state.clients.push({id:'C'+i,name:'Cliente '+i});state.lots.push({id:'L'+i,residenceId:'R'});
  state.sales.push({id:'S'+i,clientId:'C'+i,lotId:'L'+i});
  state.payments.push({id:'P'+i,saleId:'S'+i,amount:100});
  state.contractTexts.push({id:'D'+i,clientId:'C'+i,lotId:'L'+i,saleId:'S'+i,residenceId:'R',status:'active'});
 }
 assert.equal(groups(state,'R').length,100);assert.equal(calls,100);
 groups(state,'R');groups(state,'R');assert.equal(calls,100);
 state.payments[0].amount=200;assert.equal(groups(state,'R')[0].model.m.paid,200);assert.equal(calls,101);
 state.contractTexts[0].status='voided';assert.equal(groups(state,'R').length,99);assert.equal(calls,101);
 day='2026-11-27';groups(state,'R');assert.equal(calls,200);
});
