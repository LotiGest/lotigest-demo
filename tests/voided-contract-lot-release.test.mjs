import test from 'node:test';
import assert from 'node:assert/strict';
import {auditVoidedContractSolarRelease,releaseVoidedContractSolar} from '../voided-contract-lot-release.mjs';
function fixture(){return {
 clients:[{id:'C1',name:'ANA'},{id:'C2',name:'LUIS'}],
 lots:[{id:'L1',residenceId:'R1',stage:1,block:'A',sourceNumber:'1',ownerClientId:'C1',status:'sold',pendingContractId:'D1',sourceFeatureKey:'MAP1',price:450000,area:200},
       {id:'L2',residenceId:'R1',stage:1,block:'A',sourceNumber:'2',status:'available'}],
 residences:[{id:'R1',records:{MAP1:{lotId:'L1',status:'sold',block:'A'}}}],
 contractTexts:[{id:'D1',residenceId:'R1',clientId:'C1',lotId:'L1',status:'voided',
  structured:{stage:1,block:'A',number:'2',price:450000}}],
 sales:[],payments:[],ownerPayments:[],historicalPayments:[],historicalContracts:[],
 ownershipStatements:[],reservations:[],clientRequests:[],cashEntries:[],receipts:[]
};}
const audit=(s)=>auditVoidedContractSolarRelease(s,'D1','L1','R1');
test('desbloquea solar 1 sin borrar cliente, ficha anulada ni solar 2',()=>{
 const db=fixture(),before=JSON.stringify(db);
 assert.equal(audit(db).allowed,true);
 const result=releaseVoidedContractSolar(db,'D1','L1','R1','ADMIN','El correcto era el solar 2');
 assert.equal(JSON.stringify(db),before);
 const lot=result.state.lots[0],doc=result.state.contractTexts[0];
 assert.equal(lot.status,'available');assert.equal(lot.ownerClientId,undefined);
 assert.equal(lot.pendingContractId,undefined);
 assert.equal(result.state.residences[0].records.MAP1.status,'available');
 assert.equal(lot.price,450000);assert.equal(lot.area,200);
 assert.equal(result.state.clients.length,2);assert.equal(result.state.lots.length,2);
 assert.equal(doc.status,'voided');assert.equal(doc.lotId,'L1');assert.equal(doc.structured.number,'2');
 assert.equal(doc.lotReleaseHistory[0].by,'ADMIN');
 assert.equal(audit(result.state).allowed,false);
});
test('otros solares del mismo cliente se preservan',()=>{
 const db=fixture();db.lots[1].ownerClientId='C1';db.lots[1].status='sold';
 const state=releaseVoidedContractSolar(db,'D1','L1','R1','ADMIN','Error de número').state;
 assert.equal(state.lots[1].ownerClientId,'C1');assert.equal(state.lots[1].status,'sold');
});
test('no libera cuando existen ventas, pagos, reservas, terceros, deudas o documentos vigentes',()=>{
 const cases=[
  x=>x.contractTexts[0].status='active',
  x=>x.lots[0].ownerClientId='C2',
  x=>x.lots[0].type='private',
  x=>x.lots[0].purchaseFromPlan=true,
  x=>x.lots[0].mapDebtFlag=true,
  x=>x.lots[0].contractId='OTRO',
  x=>x.contractTexts.push({id:'D2',residenceId:'R1',clientId:'C1',lotId:'L1',status:'active'}),
  x=>x.sales.push({id:'S',clientId:'C1',lotId:'L1'}),
  x=>x.contractTexts[0].saleId='VENTA-ANTIGUA',
  x=>x.reservations.push({id:'R',lotId:'L1',status:'active'}),
  x=>x.clientRequests.push({id:'REQ',lotId:'L1',status:'pending'}),
  x=>x.ownerPayments.push({id:'P',clientId:'C1',residenceId:'R1',allocations:[{references:[{lotId:'L1'}]}]}),
  x=>x.historicalPayments.push({id:'HP',lotId:'L1'}),
  x=>x.ownershipStatements.push({id:'OWN',references:[{lotId:'L1'}]}),
  x=>x.cashEntries.push({id:'CASH',clientId:'C1',residenceId:'R1'}),
  x=>x.receipts.push({id:'REC',lotId:'L1'}),
  x=>x.residences[0].records.MAP1.lotId='L2'
 ];
 for(const mutate of cases){const db=fixture();mutate(db);
  assert.equal(audit(db).allowed,false,JSON.stringify(db));
  assert.throws(()=>releaseVoidedContractSolar(db,'D1','L1','R1','ADMIN','Error revisado'));
 }
});
test('otra residencial, solar ajeno y doble liberación quedan bloqueados',()=>{
 const db=fixture();
 assert.equal(auditVoidedContractSolarRelease(db,'D1','L1','R2').allowed,false);
 assert.equal(auditVoidedContractSolarRelease(db,'D1','L2','R1').allowed,false);
 const state=releaseVoidedContractSolar(db,'D1','L1','R1','ADMIN','Error revisado').state;
 assert.equal(audit(state).allowed,false);
});


test('grupo de dos solares: anulación del solar 1 no libera el solar 2 vigente',()=>{
 const db=fixture();
 db.contractTexts[0].contractLotIds=['L1','L2'];
 db.contractTexts.push({id:'D2',residenceId:'R1',clientId:'C1',lotId:'L2',
   contractLotIds:['L1','L2'],status:'active'});
 assert.equal(audit(db).allowed,true,'Otro solar activo del grupo no bloquea al principal');
 assert.equal(auditVoidedContractSolarRelease(db,'D1','L2','R1').allowed,false);
 const after=releaseVoidedContractSolar(db,'D1','L1','R1','ADMIN','Contrato del solar equivocado').state;
 assert.equal(after.lots[0].status,'available');
 assert.equal(after.lots[1].status,'available');
 assert.equal(after.contractTexts[1].status,'active');
 assert.equal(after.lots[1].ownerClientId,undefined);
});
test('un solar principal de contrato vigente nunca se libera aunque aparezca en grupo anulado',()=>{
 const db=fixture();
 db.contractTexts[0].contractLotIds=['L1','L2'];
 db.contractTexts.push({id:'D2',residenceId:'R1',clientId:'C1',lotId:'L1',
   contractLotIds:['L1','L2'],status:'active'});
 assert.equal(audit(db).allowed,false);
});
