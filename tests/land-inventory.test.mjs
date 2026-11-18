import {test} from 'node:test';import assert from 'node:assert/strict';
import {prepareLandInventoryImport,landInventoryColumns as H} from '../land-inventory.mjs';
const fixture=()=>({version:3,company:{},residences:[{id:'r'}],clients:[{id:'C0',name:'ANA',identity:'0012345678901'}],lots:[{id:'MAP1',residenceId:'r',stage:1,block:'A',sourceNumber:'3',type:'solar',sourceFeatureKey:'f1',price:100,area:20,status:'available'},{id:'MAP2',residenceId:'r',stage:2,block:'A',sourceNumber:'3',type:'solar',sourceFeatureKey:'f2',price:200,area:30,status:'available'}],sales:[],payments:[],ownershipStatements:[]});
const plan=(state,rows)=>prepareLandInventoryImport([{sheet:'Terrenos',rows:[H,...rows]}],state,'r',[{key:'f1'},{key:'f2'}]);
test('mismo cliente existente adquiere varios solares en distintas etapas; precio/medidas, croquis y reimportación sin duplicar',()=>{const before=fixture(),rows=[['MAP1',1,'A',3,'Solar','ANA','0012345678901','','',100,160,10,16],['MAP2',2,'A',3,'Solar','ANA','0012345678901'],['',1,'B',5,'Solar','ANA','0012345678901','','',300,200,10,20]];const p=plan(before,rows);assert.deepEqual(p.errors,[]);assert.equal(p.state.clients.length,1);assert.equal(p.state.lots.length,3);assert.equal(p.state.lots.filter(l=>l.ownerClientId==='C0').length,3);assert.equal(p.warnings.length,1);assert.equal(p.state.lots[0].dimensions.front,10);assert.equal(p.state.lots[0].area,160);assert.equal(p.state.clients[0].identity,'0012345678901');assert.deepEqual(before,fixture());assert.deepEqual(p.state.sales,[]);assert.deepEqual(p.state.payments,[]);const again=plan(p.state,rows);assert.deepEqual(again.errors,[]);assert.equal(again.state.lots.length,3);assert.equal(again.state.clients.length,1);assert.equal(again.warnings.length,1);});
test('comprador nuevo por identidad se crea una sola vez y conserva ceros iniciales',()=>{const p=plan(fixture(),[['MAP1',1,'A',3,'Solar','LUIS','0000123456789'],['MAP2',2,'A',3,'Solar','LUIS','0000123456789']]);assert.deepEqual(p.errors,[]);assert.equal(p.state.clients.length,2);assert.equal(p.state.clients[1].identity,'0000123456789');assert.equal(p.state.lots[0].ownerClientId,p.state.lots[1].ownerClientId);});
test('errores bloquean todo: etapa ambigua, código contradictorio, duplicados, precio y cambio de dueño',()=>{for(const rows of [[['','','A',3,'Solar','ANA','0012345678901']],[['MAP1',2,'A',3,'Solar']],[['MAP1'],['MAP1']],[['MAP1',1,'A',3,'Solar','ANA','0012345678901','','',-1]],[['MAP1',1,'A',3,'Solar','OTRA','0012345678901']]]){const state=fixture(),p=plan(state,rows);assert.ok(p.errors.length);assert.equal(p.state,null);assert.deepEqual(state,fixture());}const state=fixture();state.lots[0].ownerClientId='OTHER';assert.equal(plan(state,[['MAP1',1,'A',3,'Solar','ANA','0012345678901']]).state,null);});
test('no mezcla residenciales ni altera el precio contractual o los pagos',()=>{const state=fixture();state.residences.push({id:'other'});state.lots[0].residenceId='other';assert.equal(plan(state,[['MAP1',1,'A',3,'Solar','ANA','0012345678901']]).state,null);state.lots[0].residenceId='r';state.sales=[{id:'S',lotId:'MAP1',clientId:'C0',price:100}];state.payments=[{id:'P',saleId:'S',amount:25}];assert.equal(plan(state,[['MAP1',1,'A',3,'Solar','ANA','0012345678901','','',101]]).state,null);const p=plan(state,[['MAP1',1,'A',3,'Solar','ANA','0012345678901','','',100]]);assert.deepEqual(p.errors,[]);assert.deepEqual(p.state.sales,state.sales);assert.deepEqual(p.state.payments,state.payments);});
test('bloques N y Ñ son distintos y ningún código puede cambiar sus referencias',()=>{const state=fixture();state.lots[0].block='N';state.lots[1].stage=1;state.lots[1].block='Ñ';const p=plan(state,[['',1,'Ñ',3,'Solar','ANA','0012345678901']]);assert.deepEqual(p.errors,[]);assert.equal(p.state.lots[1].ownerClientId,'C0');assert.equal(p.state.lots[0].ownerClientId,undefined);assert.equal(plan(state,[['MAP1',1,'Ñ',3,'Solar','ANA','0012345678901']]).state,null);});

test('plantilla con hojas auxiliares importa solo el inventario y admite identidad pendiente sin crear pagos',()=>{
 const before=fixture(),rows=[['MAP1',1,'A',3,'Solar','MARIA DOCUMENTAL','', '', '',300,160,10,16],['MAP2',2,'A',3,'Solar','MARIA DOCUMENTAL','']];
 const sheets=[
  {sheet:'Primas y abonos',rows:[H,...rows]},
  {sheet:'Precios etapa 2',rows:[['Etapa','Bloque','Solar','Área m²'],[2,'A',3,160]]},
  {sheet:'Compradores ZIP',rows:[['Archivo de origen','Nombre del comprador'],['historico.xlsx','MARIA DOCUMENTAL']]},
  {sheet:'Resumen de integración',rows:[['Reporte de terrenos']]}
 ];
 const plan1=prepareLandInventoryImport(sheets,before,'r',[{key:'f1'},{key:'f2'}]);
 assert.deepEqual(plan1.errors,[]);
 assert.equal(plan1.changes.length,2);
 assert.deepEqual(plan1.ignoredSheets,['Precios etapa 2','Compradores ZIP','Resumen de integración']);
 assert.equal(plan1.pendingIdentities,1);
 const buyer=plan1.state.clients.find(c=>c.name==='MARIA DOCUMENTAL');
 assert.ok(buyer);
 assert.equal(buyer.identity,'');
 assert.equal(buyer.identityPending,true);
 assert.ok(plan1.state.lots.every(l=>l.ownerClientId===buyer.id&&l.ownerIdentityPending===true));
 assert.deepEqual(plan1.state.sales,before.sales);
 assert.deepEqual(plan1.state.payments,before.payments);
 const plan2=prepareLandInventoryImport(sheets,plan1.state,'r',[{key:'f1'},{key:'f2'}]);
 assert.deepEqual(plan2.errors,[]);
 assert.equal(plan2.state.clients.length,plan1.state.clients.length);
 assert.equal(plan2.state.lots.length,plan1.state.lots.length);
 assert.deepEqual(before,fixture());
});
test('si no hay hoja de terrenos devuelve un error y no modifica los datos',()=>{
 const state=fixture();
 const p=prepareLandInventoryImport([{sheet:'Resumen',rows:[['Cliente','Monto'],['A',1]]}],state,'r',[]);
 assert.equal(p.state,null);assert.match(p.errors[0],/No se encontró una hoja válida/);
 assert.deepEqual(state,fixture());
});

test('código externo distinto se vincula por etapa bloque solar sin alterar el código original',()=>{
 const state=fixture();
 const p=plan(state,[['CODIGO-PLANILLA-ANTERIOR',2,'A',3,'Solar','ANA','0012345678901']]);
 assert.deepEqual(p.errors,[]);
 assert.equal(p.changes.length,1);
 assert.equal(p.changes[0].id,'MAP2');
 assert.equal(p.state.lots.length,state.lots.length);
 assert.equal(p.matchedByReference.length,1);
 assert.equal(p.state.lots[1].id,'MAP2');
 const again=plan(p.state,[['CODIGO-PLANILLA-ANTERIOR',2,'A',3,'Solar','ANA','0012345678901']]);
 assert.deepEqual(again.errors,[]);
 assert.equal(again.state.lots.length,state.lots.length);
});
test('Código en conflicto con otra etapa bloque o solar impide asignación equivocada',()=>{
 const state=fixture();
 const p=plan(state,[['MAP1',2,'A',3,'Solar','ANA','0012345678901']]);
 assert.equal(p.state,null);
 assert.match(p.errors[0],/Código corresponde a otro solar/);
 assert.deepEqual(state,fixture());
});
