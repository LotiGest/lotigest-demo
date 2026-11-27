import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./contract-client-edit-ui.js',import.meta.url),'utf8');
function make(){
 const client={id:'C1',name:'CLIENTE PRUEBA',identity:'',phone:'',email:'',address:'',rtn:'',maritalStatus:'',occupation:'',protectedExtra:'conservar'};
 let draft={mode:'manual',preferredClientId:'C1',clientEditing:false,clientEditValues:null,
  values:{lotId:'L2',stage:'1',block:'J',solarPrice_0:'573680',down:'30000',months:'84',date:'2026-11-23'},busy:false};
 const db={clients:[client,{id:'C2',name:'OTRA PERSONA',identity:'1413000000000'}],lots:[{id:'L2',price:573680}]};
 const listeners={},toasts=[],review={innerHTML:''},queue={latest:JSON.stringify(db),confirmed:JSON.stringify(db),pending:null};
 const doc={
  addEventListener:(type,fn)=>(listeners[type]??=[]).push(fn),
  getElementById:id=>id==='contract-intake-review'?review:id==='contract-intake-form'?{id,outerHTML:'<form>Solar</form>'}:null,
  querySelector:sel=>sel==='[data-contract-client-edit-save]'?{disabled:false,isConnected:true}:null,
  querySelectorAll:()=>[]
 };
 const win={addEventListener:(type,fn)=>(listeners['window:'+type]??=[]).push(fn)};
 const summary='<section class="full notice-card lg-contract-customer-loaded"><strong>CLIENTE PRUEBA</strong><small>Datos copiados directamente de Clientes. No debes adjuntar documentos ni volver a ingresar esta información; si faltan datos puedes completarlos posteriormente en Clientes.</small></section>';
 const base=()=>'<form id="contract-intake-form">'+summary+'<p>Solar J 1</p></form>';
 let current=db;
 const get=id=>current.clients.find(c=>c.id===id);
 const app=new Function('document','window','contractIntakeManualFields','contractIntakeWorking',
  'getClient','esc','contractIdentityFormat','db','contractIntakeAdmin','cloudWrite','cloudFlush',
  'cloudReady','cloudBlocked','cloudQueue','contractIntakeRememberExtras','contractIntakeFields','toast',
  source+';return {view:contractIntakeManualFields,patch:window.lotigestContractClientEdit.patch};')(
  doc,win,base,draft,get,s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),
  v=>String(v??'').trim(),db,()=>true,
  raw=>{queue.latest=raw;current=JSON.parse(raw);},
  async()=>{queue.confirmed=queue.latest;},true,false,queue,()=>{},()=>app.view(),m=>toasts.push(m));
 return {app,draft,db,client,win,doc,listeners,review,queue,toasts};
}
test('el lapicito aparece junto a Cliente ya registrado y abre editor sin ir a Clientes',()=>{
 const {app,draft}=make();
 assert.match(app.view(),/data-contract-client-edit/);
 assert.match(app.view(),/aria-label="Editar datos de CLIENTE PRUEBA"/);
 assert.match(app.view(),/Cliente ya registrado/);
 draft.clientEditing=true;draft.clientEditValues={name:'CLIENTE PRUEBA',identity:'0801200000000'};
 const html=app.view();
 assert.match(html,/id="contract-intake-client-editor"/);
 assert.match(html,/Guardar cliente/);
 assert.match(html,/data-contract-client-edit-value="identity"/);
 assert.match(html,/data-contract-client-edit-value="phone"/);
 assert.match(html,/data-contract-client-edit-value="email"/);
 assert.match(html,/data-contract-client-edit-value="address"/);
 assert.match(html,/data-contract-client-edit-value="rtn"/);
 assert.match(html,/data-contract-client-edit-value="maritalStatus"/);
 assert.match(html,/data-contract-client-edit-value="occupation"/);
 assert.doesNotMatch(html,/name="identity"/,'No agrega campos de cliente al formulario de contrato');
});
test('editar conserva el ID del cliente y los demás datos y no cambia solares o pagos',()=>{
 const {app,client,db}=make();
 const before=JSON.stringify(db);
 const result=app.patch(client,{name:'nuevo nombre',identity:'0801 2000 00000',phone:'+1 3055550199',email:'test@example.com',address:'San Marcos, Honduras'},db.clients);
 assert.equal(result.id,'C1');assert.equal(result.name,'NUEVO NOMBRE');
 assert.equal(result.phone,'+1 3055550199');assert.equal(result.email,'test@example.com');
 assert.equal(result.protectedExtra,'conservar');
 assert.deepEqual(db,JSON.parse(before));
});
test('rechaza identidad duplicada y correo inválido sin afectar ficha del cliente',()=>{
 const {app,client,db}=make();
 assert.throws(()=>app.patch(client,{identity:'1413 0000 00000'},db.clients),/identidad ya está registrada/);
 assert.throws(()=>app.patch(client,{email:'incorrecto'},db.clients),/correo electrónico válido/);
 assert.throws(()=>app.patch(client,{name:' '},db.clients),/nombre es obligatorio/);
});
test('no se presenta la ficha de otro cliente en el borrador original',()=>{
 const {app,draft}=make();
 draft.preferredClientId='no-existe';
 assert.doesNotMatch(app.view(),/data-contract-client-edit/);
});
