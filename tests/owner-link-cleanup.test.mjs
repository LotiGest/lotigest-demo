import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditOrphanOwnerLinks,removeOrphanOwnerLinks} from '../owner-link-cleanup.mjs';
const lot=(id,clientId='C1',o={})=>({id,residenceId:'ARRAYAN',stage:1,block:'A',sourceNumber:id,
 status:'available',ownerClientId:clientId,area:240,price:200000,...o});
function state(){
 return {version:3,company:{name:'Grupo H'},residences:[{id:'ARRAYAN'}],clients:[
  {id:'C1',name:'CLIENTE UNO'},{id:'C2',name:'CLIENTE DOS'}],
  lots:[lot('L1'),lot('L2'),lot('L3'),lot('L4','C2'),lot('L5','C2',{status:'sold'}),
   lot('L6','C2',{status:'reserved'}),lot('L7','C2'),lot('L8','C2'),lot('L9','C2'),
   lot('L10','C2',{status:'private'}),lot('L11','C1'),lot('L12','C1')],
  contractTexts:[{id:'DOC1',clientId:'C1',lotId:'L1',status:'active'},
   {id:'DOC2',clientId:'C1',lotId:'L11',contractLotIds:['L11','L12'],status:'pending-sale'},
   {id:'DOC-OTHER',clientId:'C1',lotId:'L7',status:'active'}],
  sales:[{id:'V1',clientId:'C2',lotId:'L5'}],
  reservations:[{id:'A1',clientId:'C2',lotId:'L6',status:'active'}],
  payments:[],ownerPayments:[{id:'P1',clientId:'C1',allocations:[{references:[{lotId:'L3'}]}]}],
  ownershipStatements:[{id:'F1',clientId:'C2',references:[{lotId:'L8'}]}],
  historicalPayments:[{id:'H1',lotId:'L9',clientId:'C2'}],historicalContracts:[]
 };
}
test('solo solares con vínculo provisional y sin respaldo documental son elegibles',()=>{
 const result=auditOrphanOwnerLinks(state(),'ARRAYAN');
 assert.deepEqual(result.candidates.map(x=>x.lotId),['L2','L4']);
 for(const id of ['L1','L3','L5','L6','L7','L8','L9','L10','L11','L12'])
  assert.ok(result.protectedLinks.some(x=>x.lotId===id),id+' debe permanecer protegido');
 assert.equal(result.candidates.find(x=>x.lotId==='L2').reason,'solar adicional sin contrato (solo vínculo provisional)');
});
test('limpieza conserva clientes, solares, medidas, ventas, pagos, fichas y contratos',()=>{
 const initial=state(),frozen=JSON.stringify(initial);
 const result=removeOrphanOwnerLinks(initial,['L2','L4'],'ARRAYAN');
 assert.equal(result.changed,2);
 assert.equal(JSON.stringify(initial),frozen);
 assert.equal(result.state.lots.length,initial.lots.length);
 for(const key of ['clients','sales','payments','ownerPayments','ownershipStatements','contractTexts','reservations'])
  assert.deepEqual(result.state[key],initial[key]);
 for(const id of ['L2','L4'])assert.equal(result.state.lots.find(l=>l.id===id).ownerClientId,undefined);
 assert.equal(result.state.lots.find(l=>l.id==='L1').ownerClientId,'C1');
 assert.equal(result.state.lots.find(l=>l.id==='L3').ownerClientId,'C1');
 assert.equal(result.state.lots.find(l=>l.id==='L2').area,240);
 assert.equal(result.state.lots.find(l=>l.id==='L2').price,200000);
});
test('prohibir desvincular un solar con contrato, venta, pago o reserva',()=>{
 const initial=state();
 for(const id of ['L1','L3','L5','L6','L7','L8','L9','L10','L11','L12'])
  assert.throws(()=>removeOrphanOwnerLinks(initial,[id],'ARRAYAN'),/no es seguro/);
 assert.throws(()=>removeOrphanOwnerLinks(initial,['L2','L2'],'ARRAYAN'),/Selección incompatible/);
 assert.throws(()=>removeOrphanOwnerLinks(initial,[],'ARRAYAN'),/Selecciona solares/);
 assert.throws(()=>removeOrphanOwnerLinks(initial,Array.from({length:21},(_,i)=>String(i)),'ARRAYAN'),/hasta 20/);
});
test('no quitar solar en otra residencial',()=>{
 const data=state();data.lots.push({...lot('OTRO'),residenceId:'OTRA'});
 assert.deepEqual(auditOrphanOwnerLinks(data,'ARRAYAN').candidates.map(x=>x.lotId),['L2','L4']);
 assert.throws(()=>removeOrphanOwnerLinks(data,['OTRO'],'ARRAYAN'),/no es seguro/);
});

test('solar Comprado provisional desde Excel vuelve a Disponible, conserva inventario y deja auditoría',()=>{
 const initial=state();initial.residences[0].records={FIG:{lotId:'EXCEL',status:'sold'}};
 initial.lots.push(lot('EXCEL','C2',{status:'sold',purchaseFromPlan:true,sourceFeatureKey:'FIG'}));
 const frozen=JSON.stringify(initial);
 const report=auditOrphanOwnerLinks(initial,'ARRAYAN');
 assert.ok(report.candidates.some(x=>x.lotId==='EXCEL'));
 const updated=removeOrphanOwnerLinks(initial,['EXCEL'],'ARRAYAN','ADMIN',
  'Se había asociado solar equivocado','2026-11-23T20:00:00.000Z').state;
 const released=updated.lots.find(x=>x.id==='EXCEL');
 assert.equal(released.status,'available');
 assert.equal(released.ownerClientId,undefined);
 assert.equal(released.purchaseFromPlan,false);
 assert.equal(updated.residences[0].records.FIG.status,'available');
 assert.equal(released.price,200000);
 assert.equal(released.area,240);
 assert.equal(released.ownerUnlinkHistory.length,1);
 assert.equal(released.ownerUnlinkHistory[0].previousOwnerClientId,'C2');
 assert.equal(released.ownerUnlinkHistory[0].previousStatus,'sold');
 assert.equal(updated.clients.length,initial.clients.length);
 assert.equal(JSON.stringify(initial),frozen);
});
test('no liberar solar si existen abonos, recibos, deudas, solicitudes o referencias sin conciliar',()=>{
 for(const kind of ['payment','receipt','ambiguous','debt','request','other-client']){
  const data=state();data.lots.push(lot('EXCEL','C2',{status:'sold'}));
  if(kind==='payment')data.payments.push({id:'P7',lotId:'EXCEL',clientId:'C2'});
  if(kind==='receipt')data.receipts=[{id:'R7',lotId:'EXCEL',clientId:'C2'}];
  if(kind==='ambiguous')data.ownerPayments.push({id:'P8',clientId:'C2',residenceId:'ARRAYAN'});
  if(kind==='debt')data.lots.at(-1).mapDebtFlag=true;
  if(kind==='request')data.clientRequests=[{id:'Q7',lotId:'EXCEL',status:'pending'}];
  if(kind==='other-client')data.lots.at(-1).clientId='C1';
  assert.throws(()=>removeOrphanOwnerLinks(data,['EXCEL'],'ARRAYAN'),/no es seguro/,kind);
 }
});

test('modo importaciones libera únicamente vínculos documentales sin contabilizar',()=>{
 const data=state();
 Object.assign(data.lots.find(l=>l.id==='L9'),{mapDebtFlag:true,historyRequiresReview:true,status:'sold'});
 const audit=auditOrphanOwnerLinks(data,'ARRAYAN',true);
 assert.ok(audit.candidates.some(x=>x.lotId==='L9'&&x.importedOnly));
 for(const id of ['L1','L3','L5','L6','L7','L10','L11','L12'])
  assert.ok(audit.protectedLinks.some(x=>x.lotId===id));
 const result=removeOrphanOwnerLinks(data,['L9'],'ARRAYAN','ADMIN','Corregir importación',undefined,true).state;
 const released=result.lots.find(l=>l.id==='L9');
 assert.equal(released.ownerClientId,undefined);
 assert.equal(released.status,'available');
 assert.equal(released.mapDebtFlag,false);
 assert.equal(released.historyRequiresReview,false);
 assert.deepEqual(result.historicalPayments,data.historicalPayments);
 assert.deepEqual(result.clients,data.clients);
 assert.deepEqual(result.contractTexts,data.contractTexts);
 data.historicalPayments[0].postedPaymentId='REAL';
 assert.ok(auditOrphanOwnerLinks(data,'ARRAYAN',true).protectedLinks.some(x=>x.lotId==='L9'));
});

test('selección masiva explícita supera 20 y conserva contratos en todas las residenciales',()=>{
 const data=state(); data.residences.push({id:'OTRA'});
 for(let i=0;i<45;i++)data.lots.push(lot('BULK-'+i,'C2',{residenceId:i<25?'ARRAYAN':'OTRA',status:'sold'}));
 const ids=auditOrphanOwnerLinks(data,null,true).candidates.map(x=>x.lotId);
 assert.ok(ids.length>45);
 const result=removeOrphanOwnerLinks(data,ids,null,'ADMIN','Corrección masiva',undefined,true,true);
 assert.equal(result.changed,ids.length);
 assert.deepEqual(result.state.contractTexts,data.contractTexts);
 assert.deepEqual(result.state.ownerPayments,data.ownerPayments);
 assert.deepEqual(result.state.sales,data.sales);
 assert.equal(result.state.lots.find(x=>x.id==='L1').ownerClientId,'C1');
 assert.equal(result.state.lots.find(x=>x.id==='BULK-44').status,'available');
 assert.throws(()=>removeOrphanOwnerLinks(data,[...ids,'L1'],null,'ADMIN','Corrección masiva',undefined,true,true),/no es seguro/);
});
