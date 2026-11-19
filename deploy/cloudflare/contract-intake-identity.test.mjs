import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {intakeCheckValues,contractIdentityDigits,contractIdentityFormat} from '../../contract-intake-core.mjs';
const ui=readFileSync(new URL('./contract-intake-ui.js',import.meta.url),'utf8');
const start=ui.indexOf('function contractIntakeData(form){');
const end=ui.indexOf('function contractIntakeActivate(',start);
if(start<0||end<start)throw Error('No se encontró guardado contractual.');
const code=ui.slice(start,end);
function setup(){
 let state={version:1,residences:[{id:'R',name:'Altos'}],lots:[{id:'G16',residenceId:'R',stage:2,block:'G',sourceNumber:'16',status:'sold',area:176,price:580564.16,dimensions:{front:11,depth:16}}],clients:[],sales:[],payments:[],reservations:[],contractTexts:[]};
 let confirmed='',writes=0,working={residenceId:'R',file:{type:'image/jpeg',size:2000},values:{_confidence:95},busy:false};
 let count=1;
 const queue={latest:JSON.stringify(state),confirmed:JSON.stringify(state),pending:null};
 class F{constructor(form){return Object.entries(form.fields)}}
 const env={
  contractIntakeWorking:working,contractIntakeAdmin:()=>true,document:{getElementById:()=>({disabled:false,isConnected:true})},
  FormData:F,getLot:id=>state.lots.find(l=>l.id===id),residence:()=>state.residences[0],
  intakeCheckValues,contractIdentityFormat,contractIdentityDigits,
  db:state,activeReservation:()=>null,
  crypto:{randomUUID:()=>String(count++).padStart(8,'0')+'-0000-4000-8000-000000000000'},
  normalizeClientLookup:x=>String(x||'').replace(/[^A-Za-z0-9]/g,'').toLowerCase(),
  fetch:async()=>({ok:true,json:async()=>({key:'foto-privada'})}),
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
 return {fn,fields,state:()=>state,writes:()=>writes,confirmed:()=>confirmed};
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
