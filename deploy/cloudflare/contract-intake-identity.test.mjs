import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {intakeCheckValues,intakePlanLots,contractIdentityDigits,contractIdentityFormat,intakeReservationFor,intakeConvertReservation} from '../../contract-intake-core.mjs';
const ui=readFileSync(new URL('./contract-intake-ui.js',import.meta.url),'utf8');
const start=ui.indexOf('function contractIntakeData(form){');
const end=ui.indexOf('function contractIntakeActivate(',start);
if(start<0||end<start)throw Error('No se encontró guardado contractual.');
const code=ui.slice(start,end);
function setup({manual=false,existingClient=false}={}){
 let state={version:1,residences:[{id:'R',name:'Altos'}],lots:[{id:'G16',residenceId:'R',stage:2,block:'G',sourceNumber:'16',status:'sold',area:176,price:580564.16,dimensions:{front:11,depth:16}}],clients:existingClient?[{id:'C-EXIST',name:'PERSONA FICTICIA',identity:'0801 1990 00021',address:'DIRECCIÓN DE PRUEBA'}]:[],sales:[],payments:[],reservations:[],contractTexts:[]};
 let confirmed='',writes=0,uploads=0,working={mode:manual?'manual':'ocr',residenceId:'R',file:manual?null:{type:'image/jpeg',size:2000},values:{_confidence:95},busy:false,preferredClientId:existingClient?'C-EXIST':''};
 let count=1;
 const queue={latest:JSON.stringify(state),confirmed:JSON.stringify(state),pending:null};
 class F{constructor(form){return Object.entries(form.fields)}}
 const env={
  buyerDate:v=>v,businessToday:()=>'2026-11-26',contractSuggestedFirstDue:()=>'2026-12-01',contractIntakeWorking:working,contractIntakeImageMime:file=>file.type,contractIntakeAdmin:()=>true,document:{addEventListener(){},getElementById:()=>({disabled:false,isConnected:true})},
  FormData:F,getLot:id=>state.lots.find(l=>l.id===id),residence:()=>state.residences[0],
  intakeCheckValues,intakePlanLots,contractIdentityFormat,contractIdentityDigits,intakeReservationFor,intakeConvertReservation,
  db:state,activeReservation:()=>null,
  crypto:{randomUUID:()=>String(count++).padStart(8,'0')+'-0000-4000-8000-000000000000'},
  normalizeClientLookup:x=>String(x||'').replace(/[^A-Za-z0-9]/g,'').toLowerCase(),
  fetch:async()=>{uploads++;return {ok:true,json:async()=>({key:'foto-privada'})};},
  cloudWrite:text=>{state=JSON.parse(text);queue.latest=text;writes++;},
  cloudFlush:async()=>{queue.confirmed=queue.latest;confirmed=queue.latest;},
  cloudQueue:queue,cloudBlocked:false,cloudOffline:false,
  getClient:id=>state.clients.find(c=>c.id===id),
  toast:()=>{},closeModal:()=>{},render:()=>{},
 };
 const names=Object.keys(env),fn=new Function(...names,code+';return {save:contractIntakeSave,getDb:()=>db};')(...Object.values(env));
 const fields={lotId:'G16',stage:'2',clientId:'',name:'PERSONA FICTICIA',identity:'0801199000021',rtn:'',
  maritalStatus:'SOLTERO',occupation:'',address:'DIRECCIÓN DE PRUEBA',block:'G',number:'16',
  areaM2:'176',areaVaras:'252.42',north:'CALLE 8 M',south:'G-3',east:'G-15',west:'G-17',
  price:'580564.16',down:'58056.42',financed:'522507.74',monthly:'6220.33',months:'84',
  pricePerVara:'2300',observations:'REPRESENTANTE FICTICIO',rawText:'TEXTO OCR DE PRUEBA'};
 if(manual){fields.solarPrice_0=fields.price;fields.date='2026-11-01';}if(existingClient)fields.clientId='C-EXIST';
 return {fn,fields,state:()=>state,writes:()=>writes,uploads:()=>uploads,confirmed:()=>confirmed};
}
test('Guardar la imagen crea cliente con identidad verificada y descripción contractual completa',async()=>{
 const f=setup();await f.fn.save({fields:f.fields});
 const db=f.fn.getDb(),d=db.contractTexts[0],c=db.clients[0];
 assert.equal(c.identity,'0801 1990 00021');
 assert.equal(d.structured.identity,c.identity);
 assert.equal(d.structured.north,'CALLE 8 M');assert.equal(d.structured.south,'G-3');
 assert.equal(d.structured.east,'G-15');assert.equal(d.structured.west,'G-17');
 assert.equal(d.structured.observations,'REPRESENTANTE FICTICIO');
 assert.equal(d.structured.areaVaras,252.42);
 assert.equal(d.structured.months,84);
 assert.equal(db.lots[0].area,176);
 assert.equal(db.lots[0].ownerClientId,c.id);
 assert.equal(db.sales.length,0);assert.equal(db.payments.length,0);
 assert.equal(f.writes(),1);assert.ok(f.confirmed());
});
test('Nunca guarda un contrato con un DNI incompleto',async()=>{
 const f=setup();f.fields.identity='0801 1990 0021';
 await assert.rejects(f.fn.save({fields:f.fields}),/13 dígitos/);
 assert.equal(f.writes(),0);assert.equal(f.state().clients.length,0);
});

function threeLots(){
 const f=setup();
 f.state().lots.push({id:'A2',residenceId:'R',stage:1,block:'A',sourceNumber:'2',status:'available',area:150},
  {id:'B3',residenceId:'R',stage:2,block:'B',sourceNumber:'3',status:'available',area:null});
 Object.assign(f.fields,{price:'600000',down:'60000',financed:'540000',monthly:'6428.57',
  solarPrice_0:'100000',solarDown_0:'10000',extraLotId_0:'A2',extraStage_0:'1',solarPrice_1:'200000',solarDown_1:'20000',
  extraLotId_1:'B3',extraStage_1:'2',solarPrice_2:'300000',solarDown_2:'30000'});
 return f;
}
test('una ficha con tres solares guarda un cliente, una foto compartida y tres vínculos con importes separados',async()=>{
 const f=threeLots();await f.fn.save({fields:f.fields});const db=f.fn.getDb();
 assert.equal(db.clients.length,1);assert.equal(db.contractTexts.length,3);assert.equal(f.writes(),1);
 assert.equal(new Set(db.contractTexts.map(d=>d.contractGroupId)).size,1);
 assert.equal(new Set(db.contractTexts.map(d=>d.documentKey)).size,1);
 assert.equal(db.contractTexts.reduce((s,d)=>s+d.structured.price,0),600000);
 assert.equal(db.contractTexts.reduce((s,d)=>s+d.structured.down,0),60000);
 for(const lot of db.lots){assert.equal(lot.ownerClientId,db.clients[0].id);const doc=db.contractTexts.find(d=>d.lotId===lot.id);assert.equal(lot.pendingContractId,doc.id);assert.equal(doc.structured.stage,lot.stage);assert.equal(doc.structured.block,lot.block);}
 assert.equal(db.lots.find(l=>l.id==='B3').area,null,'el área conjunta no se copia al tercer solar');
 assert.equal(db.lots[0].area,176);assert.equal(db.lots[1].area,150);
 assert.equal(db.sales.length,0);assert.equal(db.payments.length,0);
});
test('si un solar está vendido, no guarda parcialmente los otros dos',async()=>{
 const f=threeLots();f.state().sales.push({id:'PREV',lotId:'B3',clientId:'OTRO'});
 await assert.rejects(f.fn.save({fields:f.fields}),/ya tiene una venta/);
 assert.equal(f.writes(),0);assert.equal(f.state().clients.length,0);assert.equal(f.state().contractTexts.length,0);
});
test('bloquea el mismo solar repetido y repartir importes que no suman el contrato',async()=>{
 const duplicate=threeLots();duplicate.fields.extraLotId_1='A2';duplicate.fields.extraStage_1='1';
 await assert.rejects(duplicate.fn.save({fields:duplicate.fields}),/mismo solar dos veces/);assert.equal(duplicate.writes(),0);
 const amounts=threeLots();amounts.fields.solarPrice_2='600000';
 await assert.rejects(amounts.fn.save({fields:amounts.fields}),/suma de precios/);assert.equal(amounts.writes(),0);
});

test('ficha manual de cliente existente se guarda sin fotografía, sin OCR y sin duplicar cliente',async()=>{
 const f=setup({manual:true,existingClient:true});
 await f.fn.save({fields:f.fields});
 const state=f.state(),doc=state.contractTexts[0];
 assert.equal(state.clients.length,1);
 assert.equal(doc.clientId,'C-EXIST');
 assert.equal(doc.format,'manual');
 assert.equal(doc.documentKey,undefined);
 assert.equal(doc.documentMime,undefined);
 assert.deepEqual(doc.pages,[]);
 assert.equal(doc.structured.identity,'0801 1990 00021');
 assert.equal(doc.structured.north,'CALLE 8 M');
 assert.equal(doc.structured.price,580564.16);
 assert.equal(state.lots[0].ownerClientId,'C-EXIST');
 assert.equal(state.sales.length,0);
 assert.equal(state.payments.length,0);
 assert.equal(f.uploads(),0);
 assert.equal(f.writes(),1);
});
test('la ficha manual exige identidad completa y evita contratos duplicados sobre el solar',async()=>{
 const missing=setup({manual:true});
 missing.fields.identity='0801 1990';
 await assert.rejects(missing.fn.save({fields:missing.fields}),/13 dígitos/);
 assert.equal(missing.writes(),0);
 const duplicate=setup({manual:true,existingClient:true});
 duplicate.state().contractTexts.push({id:'DOC-ANT',lotId:'G16',status:'pending-sale'});
 await assert.rejects(duplicate.fn.save({fields:duplicate.fields}),/Ya existe un documento/);
 assert.equal(duplicate.writes(),0);
});
