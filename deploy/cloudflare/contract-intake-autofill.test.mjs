import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {intakePlanLots,intakeCheckValues,contractIdentityDigits,contractIdentityFormat} from '../../contract-intake-core.mjs';
const source=readFileSync(new URL('./contract-intake-ui.js',import.meta.url),'utf8');
const fieldsCode=source.slice(source.indexOf('function contractIntakeManualCash('),source.indexOf('function contractIntakeFields(){'));
const saveCode=source.slice(source.indexOf('function contractIntakeData(form){'),source.indexOf('function contractIntakeActivate('));
if(!fieldsCode.includes('function contractIntakeManualFields()')||!saveCode.includes('async function contractIntakeSave('))
 throw Error('Falta la funcionalidad de formulario compacto.');
const base=()=>({
 version:3,company:{},residences:[{id:'R'}],
 clients:[{id:'C',name:'CLIENTE FICTICIO',identity:'0801 1990 00021',phone:'+1 305 123 4567',address:'OCOTEPEQUE'}],
 lots:[
  {id:'L1',residenceId:'R',stage:1,block:'A',sourceNumber:'1',price:200000,area:170,status:'available',dimensions:{front:10,depth:17}},
  {id:'L2',residenceId:'R',stage:2,block:'B',sourceNumber:'2',price:250000,area:180,status:'available',dimensions:{front:12,depth:15}}
 ],
 sales:[],payments:[],reservations:[],contractTexts:[]
});
const formData=class{constructor(form){return Object.entries(form.fields)}};
function setup(){
 let db=base(),writes=0,n=0;
 const queue={latest:JSON.stringify(db),confirmed:JSON.stringify(db)};
 const env={db,contractIntakeWorking:{mode:'manual',residenceId:'R',values:{},busy:false,preferredClientId:'C'},
  contractIntakeAdmin:()=>true,FormData:formData,document:{getElementById:()=>({disabled:false,isConnected:true})},
  intakePlanLots,intakeCheckValues,contractIdentityDigits,contractIdentityFormat,
  getLot:id=>db.lots.find(l=>l.id===id),getClient:id=>db.clients.find(c=>c.id===id),
  residence:()=>db.residences[0],activeReservation:()=>null,crypto:{randomUUID:()=>String(++n).padStart(8,'0')+'-0000-4000-8000-000000000000'},
  normalizeClientLookup:v=>String(v||'').replace(/[^a-z0-9]/gi,'').toLowerCase(),
  businessToday:()=> '2026-11-20',buyerDate:v=>v,
  cloudWrite:t=>{db=JSON.parse(t);queue.latest=t;writes++;},cloudFlush:async()=>{queue.confirmed=queue.latest;},
  cloudQueue:queue,cloudBlocked:false,cloudOffline:false,toast(){},closeModal(){},render(){}};
 const save=new Function(...Object.keys(env),saveCode+';return contractIntakeSave;')(...Object.values(env));
 const fields={clientId:'C',name:'CLIENTE FICTICIO',identity:'0801199000021',phone:'+1 305 123 4567',
  address:'OCOTEPEQUE',lotId:'L1',stage:'1',block:'A',number:'1',
  price:'1',solarPrice_0:'200000',financed:'1',monthly:'1',down:'50000',months:'60',date:'2026-11-01',firstDueDate:'2026-12-01'};
 return {save,fields,db:()=>db,writes:()=>writes};
}
test('nuevo contrato muestra cliente y medidas del inventario sin pedir colindancias',()=>{
 const db=base(),draft={mode:'manual',preferredClientId:'C',values:{stage:'1',lotId:'L1',down:50000,months:60},extraLots:[]};
 const env={contractIntakeWorking:draft,db,residence:()=>db.residences[0],residenceLots:()=>db.lots,
  getClient:id=>db.clients.find(c=>c.id===id),getLot:id=>db.lots.find(l=>l.id===id),
  activeReservation:()=>null,document:{addEventListener(){}},esc:v=>String(v??'')};
 const render=new Function(...Object.keys(env),fieldsCode+';return contractIntakeManualFields;')(...Object.values(env));
 const html=render();
 assert.match(html,/Cliente ya registrado/);
 assert.match(html,/data-contract-client-search>Buscar/);
 assert.match(html,/name="solarPrice_0"/);
 assert.match(html,/CLIENTE FICTICIO/);
 assert.match(html,/Frente 10/);
 assert.match(html,/L 200,000.00/);
 assert.match(html,/L 150,000.00/);
 assert.match(html,/L 2,500.00/);
 assert.doesNotMatch(html,/Bloque leído|Solar leído|Norte|Sur|Este|Oeste/);
});
test('permite negociar otro precio sin modificar el precio ni medidas de Predios',async()=>{
 const x=setup();x.fields.solarPrice_0='220000';await x.save({fields:x.fields});
 assert.equal(x.db().contractTexts[0].structured.price,220000);
 assert.equal(x.db().contractTexts[0].structured.financed,170000);
 assert.equal(x.db().contractTexts[0].structured.monthlyCalculated,2833.33);
 assert.equal(x.db().contractTexts[0].structured.inventoryPriceAtContract,200000);
 assert.equal(x.db().contractTexts[0].structured.negotiatedPrice,true);
 assert.equal(x.db().lots[0].price,200000);
 assert.equal(x.db().lots[0].area,170);assert.equal(x.db().clients.length,1);
 assert.equal(x.db().payments.length,0);
});
test('permite precio más barato y prima diferente con saldo y cuota automáticos',async()=>{
 const x=setup();Object.assign(x.fields,{solarPrice_0:'175000',down:'30000',months:'48'});
 await x.save({fields:x.fields});
 const d=x.db().contractTexts[0].structured;
 assert.equal(d.price,175000);assert.equal(d.down,30000);assert.equal(d.financed,145000);
 assert.equal(d.monthlyCalculated,3020.83);
 assert.equal(x.db().lots[0].price,200000);
});
test('dos solares suman sus precios y primas, manteniendo medidas originales',async()=>{
 const x=setup();Object.assign(x.fields,{down:'100000',solarPrice_0:'215000',solarDown_0:'40000',
  extraLotId_0:'L2',extraStage_0:'2',solarPrice_1:'230000',solarDown_1:'60000'});
 await x.save({fields:x.fields});
 const db=x.db();assert.equal(db.contractTexts.length,2);
 assert.equal(db.contractTexts.reduce((n,d)=>n+d.structured.price,0),445000);
 assert.equal(db.lots[0].price,200000);assert.equal(db.lots[1].price,250000);
 assert.equal(db.contractTexts.reduce((n,d)=>n+d.structured.down,0),100000);
 assert.equal(db.lots[0].area,170);assert.equal(db.lots[1].area,180);
});
test('permite definir precio en contrato si Predios no tiene un valor todavía',async()=>{
 const x=setup();x.db().lots[0].price=null;
 await x.save({fields:x.fields});
 assert.equal(x.db().contractTexts[0].structured.price,200000);
 assert.equal(x.db().lots[0].price,null);
});
test('rechaza contrato sin precio de venta',async()=>{
 const x=setup();x.fields.solarPrice_0='';
 await assert.rejects(x.save({fields:x.fields}),/precio de venta válido/);
 assert.equal(x.writes(),0);
});
test('rechaza una prima superior al precio negociado',async()=>{
 const x=setup();x.fields.solarPrice_0='40000';
 await assert.rejects(x.save({fields:x.fields}),/menor que el precio de venta acordado/);
 assert.equal(x.writes(),0);
});
test('prima pagada crea venta y recibo por el importe negociado',async()=>{
 const x=setup();Object.assign(x.fields,{solarPrice_0:'180000',down:'40000',
 primaPaid:'on',primaDate:'2026-11-02',primaMethod:'Efectivo'});
 await x.save({fields:x.fields});
 assert.equal(x.db().sales[0].price,180000);assert.equal(x.db().sales[0].downPayment,40000);
 assert.equal(x.db().payments[0].amount,40000);
 assert.equal(x.db().lots[0].price,200000);
});
test('búsqueda recupera clientes existentes por nombre o identidad',()=>{
 const db=base(),draft={mode:'manual',values:{}};
 const box={innerHTML:''};
 const env={contractIntakeWorking:draft,db,document:{addEventListener(){},getElementById:id=>id==='contract-client-results'?box:null},esc:v=>String(v??'')};
 const search=new Function(...Object.keys(env),fieldsCode+';return contractIntakeClientSearch;')(...Object.values(env));
 search('ficticio');assert.match(box.innerHTML,/CLIENTE FICTICIO/);
 search('0801');assert.match(box.innerHTML,/CLIENTE FICTICIO/);
 search('nadie');assert.match(box.innerHTML,/No aparece el cliente/);
});
