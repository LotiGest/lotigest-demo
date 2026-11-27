import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {intakePlanLots,intakeCheckValues,contractIdentityDigits,contractIdentityFormat,intakeReservationFor,intakeConvertReservation} from '../../contract-intake-core.mjs';
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
  contractIntakeAdmin:()=>true,FormData:formData,document:{addEventListener(){},getElementById:()=>({disabled:false,isConnected:true})},
  intakePlanLots,intakeCheckValues,contractIdentityDigits,contractIdentityFormat,intakeReservationFor,intakeConvertReservation,
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
 assert.match(html,/Frente:<\/b> 10/);
 assert.match(html,/lg-contract-step-client/);
 assert.match(html,/lg-contract-step-lot/);
 assert.match(html,/lg-contract-step-terms/);
 assert.match(html,/lg-contract-step-dates/);
 assert.match(html,/name="block"/);
 assert.match(html,/name="lotId"/);
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
 primaPaid:'on',primaDate:'2026-11-02',primaMethod:'Efectivo',primaRef:'990003'});
 await x.save({fields:x.fields});
 assert.equal(x.db().sales[0].price,180000);assert.equal(x.db().sales[0].downPayment,40000);
 assert.equal(x.db().payments[0].amount,40000);
 assert.equal(x.db().lots[0].price,200000);
});
test('búsqueda recupera clientes existentes por nombre o identidad',()=>{
 const db=base(),draft={mode:'manual',values:{}};
 const box={innerHTML:''};
 const env={contractIntakeWorking:draft,db,document:{addEventListener(){},getElementById:id=>id==='contract-intake-client-results'?box:null},esc:v=>String(v??'')};
 const search=new Function(...Object.keys(env),fieldsCode+';return contractIntakeClientSearch;')(...Object.values(env));
 search('ficticio');assert.match(box.innerHTML,/CLIENTE FICTICIO/);
 search('0801');assert.match(box.innerHTML,/CLIENTE FICTICIO/);
 search('nadie');assert.match(box.innerHTML,/No aparece el cliente/);
});

test('cambiar de solar no arrastra el precio ni la prima del solar anterior',()=>{
 const db=base(),draft={mode:'manual',values:{lotId:'L1',stage:'1',solarPrice_0:'220000',down:'40000',primaPaid:'on'},extraLots:[]};
 const section=source.slice(source.indexOf('function contractIntakeRememberExtras(form){'),source.indexOf('function contractIntakeExtraFields('));
 const env={contractTotalsApply:()=>{},contractIntakeWorking:draft,db,FormData:formData,
  getLot:id=>db.lots.find(l=>l.id===id),contractIdentityFormat,
  document:{addEventListener(){}},crypto:{randomUUID:()=>''}};
 const remember=new Function(...Object.keys(env),saveCode.slice(0,saveCode.indexOf('function contractIntakeFindClient('))+
  section+';return contractIntakeRememberExtras;')(...Object.values(env));
 const form={fields:{lotId:'L2',stage:'2',solarPrice_0:'220000',down:'40000',identity:'0801199000021'},
  querySelector:()=>({checked:false})};
 remember(form);
 assert.equal(draft.values.lotId,'L2');
 assert.equal(draft.values.solarPrice_0,250000);
 assert.equal(draft.values.down,'');
 assert.equal(draft.values.primaPaid,'off');
});


test('cliente seleccionado muestra su ficha completa sin pedir documentos ni campos por rellenar',()=>{
 const db=base();
 Object.assign(db.clients[0],{identity:'',phone:'',address:'',rtn:'',maritalStatus:'',occupation:''});
 const draft={mode:'manual',preferredClientId:'C',values:{stage:'1',lotId:'L1',identity:'DNI ANTIGUO DE OTRA PERSONA',phone:'OTRO TELÉFONO'},extraLots:[]};
 const env={contractIntakeWorking:draft,db,residence:()=>db.residences[0],residenceLots:()=>db.lots,
  getClient:id=>db.clients.find(c=>c.id===id),getLot:id=>db.lots.find(l=>l.id===id),
  activeReservation:()=>null,document:{addEventListener(){}},esc:v=>String(v??'')};
 const render=new Function(...Object.keys(env),fieldsCode+';return contractIntakeManualFields;')(...Object.values(env));
 const html=render();
 assert.match(html,/CLIENTE FICTICIO/);
 assert.match(html,/Identidad:<\/b> No registrada/);
 assert.match(html,/RTN:<\/b> No registrado/);
 assert.match(html,/Teléfono:<\/b> No registrado/);
 assert.match(html,/Dirección:<\/b> No registrada/);
 assert.match(html,/name="clientId" value="C"/);
 assert.match(html,/name="identity" value=""/);
 assert.doesNotMatch(html,/Completar identidad del cliente/);
 assert.doesNotMatch(html,/DNI ANTIGUO DE OTRA PERSONA|OTRO TELÉFONO/);
 assert.doesNotMatch(html,/type="file"|capture="environment"|Elegir de galería/);
});

test('al pulsar el resultado de búsqueda copia los datos del cliente seleccionado a los cuatro pasos',()=>{
 const db=base();
 const draft={mode:'manual',residenceId:'R',preferredClientId:'',
  values:{date:'2026-11-20',stage:'1',name:'CLIENTE EQUIVOCADO',identity:'1111111111111'},extraLots:[]};
 const listeners={};const review={innerHTML:''};
 const document={addEventListener:(type,fn)=>(listeners[type]??=[]).push(fn),
  getElementById:id=>id==='contract-intake-review'?review:null};
 const env={contractIntakeWorking:draft,db,document,residence:()=>db.residences[0],
  residenceLots:()=>db.lots,getClient:id=>db.clients.find(c=>c.id===id),
  getLot:id=>db.lots.find(l=>l.id===id),activeReservation:()=>null,
  esc:v=>String(v??''),contractIntakeFields:()=>String(draft.values.name)};
 new Function(...Object.keys(env),fieldsCode)(...Object.values(env));
 const handler=listeners.click.find(fn=>fn.toString().includes('[data-contract-client-pick],[data-contract-client-clear]'));
 assert.ok(handler);
 const choice={dataset:{contractClientPick:'C'}};
 handler({target:{closest:selector=>selector==='[data-contract-client-pick],[data-contract-client-clear]'?choice:null},
  preventDefault(){},stopImmediatePropagation(){}});
 assert.equal(draft.preferredClientId,'C');
 assert.equal(draft.values.name,db.clients[0].name);
 assert.equal(draft.values.identity,db.clients[0].identity);
 assert.equal(draft.values.phone,db.clients[0].phone);
 assert.equal(draft.values.address,db.clients[0].address);
 assert.equal(draft.values.date,'2026-11-20');
 assert.equal(review.innerHTML,db.clients[0].name);
 assert.equal(draft.extraLots.length,0);
});

test('cliente ya registrado sin DNI se puede vincular sin documentos y sin duplicar su ficha',async()=>{
 const x=setup();
 x.db().clients[0].identity='';
 x.db().clients[0].phone='';
 x.db().clients[0].address='';
 x.fields.identity='0801199000021'; // Una entrada anterior nunca debe suplantar la ficha.
 x.fields.phone='99999999';
 x.fields.address='DIRECCIÓN ANTERIOR';
 await x.save({fields:x.fields});
 const db=x.db();
 assert.equal(db.clients.length,1);
 assert.equal(db.contractTexts.length,1);
 assert.equal(db.contractTexts[0].clientId,'C');
 assert.equal(db.contractTexts[0].structured.identity,'');
 assert.equal(db.contractTexts[0].structured.phone,'');
 assert.equal(db.contractTexts[0].structured.address,'');
 assert.equal(db.contractTexts[0].structured.existingClientVerified,undefined);
 assert.equal(db.lots[0].ownerClientId,'C');
 assert.equal(db.payments.length,0);
});

test('un cliente nuevo sigue exigiendo identidad válida y no se puede suplantar otro cliente',async()=>{
 const x=setup();
 x.fields.clientId='';
 x.fields.identity='0801';
 await assert.rejects(x.save({fields:x.fields}),/DNI debe contener exactamente 13 dígitos/);
 assert.equal(x.writes(),0);
 const y=setup();
 y.fields.clientId='C-inventado';
 await assert.rejects(y.save({fields:y.fields}),/cliente seleccionado cambió/);
 assert.equal(y.writes(),0);
});

test('prima desde contrato conserva el correlativo con ceros iniciales',async()=>{
 const x=setup();Object.assign(x.fields,{solarPrice_0:'180000',down:'40000',primaPaid:'on',primaDate:'2026-11-02',primaMethod:'Efectivo',primaRef:'00006159'});
 await x.save({fields:x.fields});
 assert.equal(x.db().payments[0].receiptReference,'00006159');
 assert.equal(x.db().payments[0].receiptReferenceNormalized,'6159');
});
test('correlativo numérico repetido se rechaza antes de guardar dinero',async()=>{
 const x=setup();x.db().ownerPayments=[{id:'OP',receiptReference:'6159'}];
 Object.assign(x.fields,{solarPrice_0:'180000',down:'40000',primaPaid:'on',primaDate:'2026-11-02',primaMethod:'Efectivo',primaRef:'00006159'});
 const before=JSON.stringify(x.db());await assert.rejects(()=>x.save({fields:x.fields}),/ya.*otro pago/);
 assert.equal(x.writes(),0);assert.equal(JSON.stringify(x.db()),before);
});

test('primas de solares distintos del mismo pago total comparten correlativo y grupo',async()=>{
 const x=setup();x.db().sales.push({id:'PREV-SALE',clientId:'C',lotId:'L2'});
 x.db().payments.push({id:'PREV-PAY',saleId:'PREV-SALE',date:'2026-11-02',method:'Efectivo',amount:50000,concept:'Prima',receiptReference:'00006159'});
 Object.assign(x.fields,{solarPrice_0:'180000',down:'40000',primaPaid:'on',primaDate:'2026-11-02',primaMethod:'Efectivo',primaRef:'00006159'});
 await x.save({fields:x.fields});
 const payments=x.db().payments;assert.equal(payments.length,2);
 assert.equal(payments[0].receiptReference,'00006159');assert.equal(payments[1].receiptReference,'00006159');
 assert.ok(payments[0].groupId);assert.equal(payments[0].groupId,payments[1].groupId);
 assert.equal(payments.reduce((n,p)=>n+p.amount,0),90000);
});
test('no comparte correlativo de prima entre fechas distintas',async()=>{
 const x=setup();x.db().sales.push({id:'PREV-SALE',clientId:'C',lotId:'L2'});
 x.db().payments.push({id:'PREV-PAY',saleId:'PREV-SALE',date:'2026-11-01',method:'Efectivo',amount:50000,concept:'Prima',receiptReference:'00006159'});
 Object.assign(x.fields,{solarPrice_0:'180000',down:'40000',primaPaid:'on',primaDate:'2026-11-02',primaMethod:'Efectivo',primaRef:'00006159'});
 await assert.rejects(()=>x.save({fields:x.fields}),/otro pago/);assert.equal(x.writes(),0);
});

test('agregar otro solar conserva precio negociado, prima vigente y datos del primer solar',()=>{
 const db=base(),draft={mode:'manual',values:{lotId:'L1',stage:'1',solarPrice_0:'200000',down:0,solarDown_0:0},extraLots:[]};
 const section=source.slice(source.indexOf('function contractIntakeRememberExtras(form){'),source.indexOf('function contractIntakeExtraFields('));
 const env={contractTotalsApply:()=>{},contractIntakeWorking:draft,FormData:formData,getLot:id=>db.lots.find(l=>l.id===id),contractIdentityFormat};
 const remember=new Function(...Object.keys(env),saveCode.slice(0,saveCode.indexOf('function contractIntakeFindClient('))+
  section+';return contractIntakeRememberExtras;')(...Object.values(env));
 const fields={lotId:'L1',stage:'1',solarPrice_0:'190000',down:'30000',months:'72',date:'2026-11-24',primaRef:'000123'};
 remember({fields,querySelector:()=>({checked:true})});
 assert.equal(draft.values.solarPrice_0,'190000');
 assert.equal(draft.values.solarDown_0,30000);
 assert.equal(draft.values.months,72);
 assert.equal(draft.values.date,'2026-11-24');
 assert.equal(draft.values.primaRef,'000123');
 draft.extraLots.push({lotId:'',stage:'1',price:'',down:''});
 remember({fields:{...fields,down:'',solarDown_0:'30000',extraLotId_0:'L2',extraStage_0:'2',solarPrice_1:'',solarDown_1:''},querySelector:()=>({checked:true})});
 assert.equal(draft.values.solarPrice_0,'190000');
 assert.equal(draft.values.solarDown_0,'30000');
 assert.equal(draft.extraLots[0].price,250000);
});

test('prima total recibida se distribuye según cada solar con un único correlativo',async()=>{
 const x=setup();
 Object.assign(x.fields,{solarPrice_0:'200000',solarDown_0:'30000',down:'50000',
  extraLotId_0:'L2',extraStage_0:'2',solarPrice_1:'250000',solarDown_1:'20000',
  primaPaid:'on',primaReceivedTotal:'50000',primaDate:'2026-11-02',primaMethod:'Efectivo',primaRef:'00006159'});
 await x.save({fields:x.fields});
 const db=x.db(),payments=db.payments;
 assert.equal(payments.length,2);
 assert.equal(payments.reduce((sum,p)=>sum+p.amount,0),50000);
 for(const [lotId,amount] of [['L1',30000],['L2',20000]]){
  const sale=db.sales.find(s=>s.lotId===lotId);
  const payment=payments.find(p=>p.saleId===sale.id);
  assert.equal(payment.amount,amount);
  assert.equal(payment.receiptReference,'00006159');
 }
 assert.ok(payments[0].groupId);
 assert.equal(payments[0].groupId,payments[1].groupId);
});
test('prima total distinta de lo pactado no registra contratos ni cobros',async()=>{
 const x=setup();
 Object.assign(x.fields,{solarPrice_0:'200000',solarDown_0:'30000',down:'50000',
  extraLotId_0:'L2',extraStage_0:'2',solarPrice_1:'250000',solarDown_1:'20000',
  primaPaid:'on',primaReceivedTotal:'40000',primaDate:'2026-11-02',primaMethod:'Efectivo'});
 const before=JSON.stringify(x.db());
 await assert.rejects(x.save({fields:x.fields}),/no coincide con la suma/);
 assert.equal(x.writes(),0);assert.equal(JSON.stringify(x.db()),before);
});
