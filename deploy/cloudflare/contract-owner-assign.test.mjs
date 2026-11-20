import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('./contract-owner-assign-ui.js',import.meta.url),'utf8');
const model=ui.slice(0,ui.indexOf('let contractOwnerDraft=null;'));
if(!model.includes('function planContractOwnerAssignment('))throw Error('Falta la validación de solares por cliente.');
const {planContractOwnerAssignment}=new Function(model+';return {planContractOwnerAssignment}')();

const fixture=()=>({
 residences:[{id:'R',name:'Altos del Arrayán'}],
 clients:[{id:'C1',name:'ANA DE PRUEBA',identity:'0801199000021'},{id:'C2',name:'PEDRO DE PRUEBA',identity:'0801199000022'}],
 lots:[
  {id:'E1-I3',residenceId:'R',stage:1,block:'I',sourceNumber:'3',status:'sold'},
  {id:'E2-I3',residenceId:'R',stage:2,block:'I',sourceNumber:'3',status:'available'},
  {id:'E2-B5',residenceId:'R',stage:2,block:'B',sourceNumber:'5',status:'available'},
  {id:'PRIV',residenceId:'R',stage:2,block:'G',sourceNumber:'6',status:'private'}
 ],
 sales:[],payments:[{id:'REC-1',amount:100}],reservations:[],contractTexts:[],
 ownershipStatements:[]
});
test('mismo bloque y solar en distintas etapas quedan asignados al cliente correcto',()=>{
 const state=fixture();
 const result=planContractOwnerAssignment(state,'R','C1',['E1-I3','E2-I3']);
 assert.equal(result.assigned,2);
 assert.equal(result.state.lots[0].ownerClientId,'C1');
 assert.equal(result.state.lots[1].ownerClientId,'C1');
 assert.equal(state.lots[0].ownerClientId,undefined,'No cambia el original antes de confirmar');
 assert.notEqual(result.lots[0].title,result.lots[1].title,'Se muestra la etapa');
 assert.deepEqual(result.state.payments,state.payments,'No crea primas ni abonos');
 assert.deepEqual(result.state.sales,state.sales,'No crea ventas');
 assert.equal(planContractOwnerAssignment(result.state,'R','C1',['E1-I3']).assigned,0,'Idempotente');
});
test('puede asignar varios bloques al mismo cliente en la misma residencial',()=>{
 const result=planContractOwnerAssignment(fixture(),'R','C1',['E1-I3','E2-B5']);
 assert.deepEqual(result.state.lots.filter(l=>l.ownerClientId==='C1').map(l=>l.id),['E1-I3','E2-B5']);
});
test('rechaza solares de otro propietario, privados o duplicados antes de escribir',()=>{
 const state=fixture();state.lots[0].ownerClientId='C2';
 assert.throws(()=>planContractOwnerAssignment(state,'R','C1',['E1-I3','E2-I3']),/otro cliente/);
 assert.equal(state.lots[1].ownerClientId,undefined);
 assert.throws(()=>planContractOwnerAssignment(fixture(),'R','C1',['PRIV']),/privadas/);
 assert.throws(()=>planContractOwnerAssignment(fixture(),'R','C1',['E2-I3','E2-I3']),/dos veces/);
});
test('protege venta, contrato, ficha previa y apartado de otras personas',()=>{
 const sale=fixture();sale.sales.push({id:'V1',lotId:'E2-I3',clientId:'C2'});
 assert.throws(()=>planContractOwnerAssignment(sale,'R','C1',['E2-I3']),/venta/);
 const doc=fixture();doc.contractTexts.push({id:'D1',lotId:'E2-I3',clientId:'C2',status:'pending-sale'});
 assert.throws(()=>planContractOwnerAssignment(doc,'R','C1',['E2-I3']),/contrato/);
 const statement=fixture();statement.ownershipStatements.push({clientId:'C2',references:[{lotId:'E2-I3'}]});
 assert.throws(()=>planContractOwnerAssignment(statement,'R','C1',['E2-I3']),/ficha de propietario/);
 const reserved=fixture();reserved.reservations.push({id:'A1',lotId:'E2-I3',status:'active'});
 assert.throws(()=>planContractOwnerAssignment(reserved,'R','C1',['E2-I3']),/apartado/);
});
test('rechaza selección sin cliente, sin etapa o residencial incorrecta',()=>{
 const state=fixture();
 assert.throws(()=>planContractOwnerAssignment(state,'R','NADIE',['E2-I3']),/cliente/);
 assert.throws(()=>planContractOwnerAssignment(state,'OTRA','C1',['E2-I3']),/residencial/);
 state.lots[1].stage=null;
 assert.throws(()=>planContractOwnerAssignment(state,'R','C1',['E2-I3']),/etapa/);
});
test('el módulo Contratos muestra asignaciones y abre formulario con etapa, bloque y solar',()=>{
 const db=fixture(),events=[],dialogs=[],content={innerHTML:''},results={innerHTML:''},save={disabled:false};
 const document={addEventListener:(name,cb)=>events.push({name,cb}),querySelector:selector=>selector.includes('.modal-content')?content:selector.includes('data-contract-owner-save')?save:null,
  getElementById:id=>id==='contract-owner-results'?results:null};
 const env={db,document,contractsPage:()=>'<section class="card" style="padding:18px;margin:14px 0">Panel de Contratos</section>',
  residence:()=>db.residences[0],residenceLots:()=>db.lots,getClient:id=>db.clients.find(c=>c.id===id),
  normalizeClientLookup:s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,''),esc:s=>String(s),contractIntakeAdmin:()=>true,
  showModal:(...args)=>dialogs.push(args),toast:()=>{}};
 const app=new Function(...Object.keys(env),ui+';return {page:contractsPage,open:contractOwnerOpen,draft:()=>contractOwnerDraft};')(...Object.values(env));
 assert.match(app.page(),/Asignar solares a cliente/);
 assert.match(app.page(),/Completar ficha de contrato manual/);
 app.open('C1');
 assert.equal(app.draft().clientId,'C1');
 assert.equal(dialogs.length,1);
 assert.match(content.innerHTML,/Etapa 1 · Bloque I · Solar 3/);
 assert.match(content.innerHTML,/Etapa 2 · Bloque I · Solar 3/);
 assert.match(results.innerHTML,/ANA DE PRUEBA/);
 assert.equal(save.disabled,false);
 assert.ok(events.some(e=>e.name==='click'));
});
