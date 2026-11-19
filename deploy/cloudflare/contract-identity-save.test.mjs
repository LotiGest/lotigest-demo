import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {contractIdentityDigits,contractIdentityFormat} from '../../contract-intake-core.mjs';
const ui=readFileSync(new URL('./contract-intake-ui.js',import.meta.url),'utf8');
const start=ui.indexOf('async function contractDniEditSave(form){');
const end=ui.indexOf("document.addEventListener('click',event=>{",start);
if(start<0||end<start)throw Error('No se encontró corregir DNI');
const code=ui.slice(start,end);
function mock(initial='',existingOther=''){
 const state={clients:[{id:'C1',name:'CLIENTE FICTICIO',identity:initial},...(existingOther?[{id:'C2',name:'OTRO CLIENTE',identity:existingOther}]:[])],
  contractTexts:[{id:'OCR1',clientId:'C1',format:'photo+ocr',status:'pending-sale',structured:{identity:initial,price:580564.16,down:58056.42,areaM2:176,north:'CALLE',number:'16'}}],
  lots:[{id:'G16',area:176,status:'available',stage:2,block:'G'}],payments:[],sales:[]};
 const queue={latest:JSON.stringify(state),confirmed:JSON.stringify(state)};
 let saved=state,writes=0,closed=false;
 class F{constructor(form){return Object.entries(form.fields)}}
 const fn=new Function('db','getClient','contractIntakeAdmin','contractIdentityDigits','contractIdentityFormat','FormData','cloudWrite','cloudFlush','closeModal','render','cloudBlocked','cloudOffline','cloudQueue','toast','confirm',
  code+';return contractDniEditSave;')(
  state,id=>state.clients.find(c=>c.id===id),()=>true,contractIdentityDigits,contractIdentityFormat,F,
  payload=>{saved=JSON.parse(payload);queue.latest=payload;writes++;},
  async()=>{queue.confirmed=queue.latest;},
  ()=>{closed=true;},()=>{},false,false,queue,()=>{},()=>true);
 return {fn,state,view:()=>saved,writes:()=>writes,closed:()=>closed};
}
test('Repara DNI faltante en cliente y todas las descripciones sin alterar pagos ni solar',async()=>{
 const f=mock();
 await f.fn({fields:{documentId:'OCR1',identity:'1411199000021'}});
 const state=f.view();
 assert.equal(state.clients[0].identity,'1411 1990 00021');
 assert.equal(state.contractTexts[0].structured.identity,'1411 1990 00021');
 assert.equal(state.contractTexts[0].structured.price,580564.16);
 assert.equal(state.contractTexts[0].structured.north,'CALLE');
 assert.equal(state.lots[0].area,176);
 assert.equal(state.sales.length,0);assert.equal(state.payments.length,0);
 assert.equal(f.writes(),1);assert.equal(f.closed(),true);
});
test('Evita guardar DNI corto o repetido en otra persona',async()=>{
 const blank=mock();
 await assert.rejects(blank.fn({fields:{documentId:'OCR1',identity:'1411 1990 0002'}}),/13 dígitos/);
 assert.equal(blank.writes(),0);
 const duplicate=mock('','1411 1990 00021');
 await assert.rejects(duplicate.fn({fields:{documentId:'OCR1',identity:'1411 1990 00021'}}),/otro cliente/);
 assert.equal(duplicate.writes(),0);
});
