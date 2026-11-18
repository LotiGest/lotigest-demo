import test from 'node:test';
import assert from 'node:assert/strict';
import {matchOcrReceipt,receiptDuplicate,verifiedInstallments,ocrReference} from '../ocr-abonos-core.mjs';
const fixture=()=>({
 clients:[{id:'C1',name:'CLIENTE DE PRUEBA'},{id:'C2',name:'OTRO CLIENTE'}],
 residences:[{id:'arrayan',name:'ALTOS DEL ARRAYÁN'}],
 lots:[
  {id:'L1',residenceId:'arrayan',stage:1,block:'I',sourceNumber:'3',status:'sold',ownerClientId:'C1'},
  {id:'L2',residenceId:'arrayan',stage:2,block:'I',sourceNumber:'3',status:'sold',ownerClientId:'C1'},
  {id:'L3',residenceId:'arrayan',stage:1,block:'A',sourceNumber:'5',status:'sold',ownerClientId:'C2'},
 ],
 sales:[],payments:[],ownerPayments:[],historicalPayments:[]
});
test('autoselección segura de cliente, etapa, bloque y solar exactos',()=>{
 const state=fixture(),fields={name:'Cliente de Prueba',reference:'00000123',date:'2024-02-15',amount:500};
 const first=matchOcrReceipt(state,fields,'RECIBI DE: CLIENTE DE PRUEBA\nETAPA 2 BLOQUE I SOLAR 3','arrayan');
 assert.equal(first.clientId,'C1');assert.deepEqual(first.selectedLotIds,['L2']);
 const ambiguous=matchOcrReceipt(state,fields,'RECIBI DE: CLIENTE DE PRUEBA\nBLOQUE I SOLAR 3','arrayan');
 assert.deepEqual(ambiguous.selectedLotIds,[]);
 assert.deepEqual(ocrReference('ETAPA 1 BLOQUE I SOLAR 3'),{stage:1,block:'I',solar:'3'});
});
test('no inventa propietario por coincidencia parcial ni asigna solar sin referencia',()=>{
 const s=fixture();
 assert.equal(matchOcrReceipt(s,{name:'CLIENTE NO IDENTIFICADO'},'','arrayan').clientId,null);
 assert.deepEqual(matchOcrReceipt(s,{name:'CLIENTE DE PRUEBA'},'','arrayan').selectedLotIds,[]);
});
test('reconoce duplicados de folio entre pagos de propietario y ventas',()=>{
 const s=fixture();s.ownerPayments.push({clientId:'C1',residenceId:'arrayan',receiptReference:'00000123',date:'2024-02-15',amountCents:50000,allocations:[]});
 assert.equal(receiptDuplicate(s,{reference:'00000123'},'arrayan').duplicate,true);
 s.ownerPayments=[];s.sales.push({id:'S1',lotId:'L1',clientId:'C1',type:'credit',price:9000,downPayment:1000,months:4,firstDueDate:'2024-01-15',date:'2023-12-15'});
 s.payments.push({id:'P1',saleId:'S1',receiptReference:'00000123',date:'2024-02-15',amount:500});
 assert.equal(receiptDuplicate(s,{reference:'00000123'},'arrayan').duplicate,true);
});
test('rojo solo para mensualidades verificadas y vencidas, verde para cubiertas',()=>{
 const s=fixture();
 assert.deepEqual(verifiedInstallments(s,'C1','arrayan','2024-06-01'),[]);
 s.sales=[{id:'S1',lotId:'L1',clientId:'C1',type:'credit',price:10000,downPayment:1000,months:3,firstDueDate:'2024-01-15',date:'2023-12-15',openingPaid:1000}];
 s.payments=[{id:'P1',saleId:'S1',amount:3000,date:'2024-01-15'}];
 const list=verifiedInstallments(s,'C1','arrayan','2024-02-20');
 assert.equal(list.length,3);assert.equal(list[0].status,'paid');assert.equal(list[1].status,'late');assert.equal(list[2].status,'pending');
 delete s.sales[0].firstDueDate;assert.deepEqual(verifiedInstallments(s,'C1','arrayan','2024-02-20'),[]);
});
