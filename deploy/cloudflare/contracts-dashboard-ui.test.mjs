import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const code=readFileSync(new URL('./contracts-dashboard-ui.js',import.meta.url),'utf8');
const releaseCore=readFileSync(new URL('../../voided-contract-lot-release.mjs',import.meta.url),'utf8').replace(/export /g,'');
function boot(){
 const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://lotigest.test',runScripts:'outside-only'});
 const w=dom.window;
 const clients=[{id:'C1',name:'Ángela López',identity:'0801199900001'},{id:'C2',name:'Luis Martínez',identity:'0801199900002'}];
 const lots=[{id:'L1',residenceId:'R',stage:1,block:'I',sourceNumber:'3',ownerClientId:'C1'},
  {id:'L2',residenceId:'R',stage:2,block:'I',sourceNumber:'3',ownerClientId:'C2'},
  {id:'L3',residenceId:'R',stage:2,block:'B',sourceNumber:'8',ownerClientId:'C2'}];
 const documents=[{id:'D1',residenceId:'R',clientId:'C1',lotId:'L1',status:'pending-sale',format:'manual',createdAt:'2026-11-01',structured:{price:90000}},
  {id:'D2',residenceId:'R',clientId:'C2',lotId:'L2',status:'active',format:'photo+ocr',createdAt:'2026-11-02',structured:{price:110000}}];
 const sales=[{id:'S1',clientId:'C2',lotId:'L3',price:95000,date:'2026-11-03'}];
 const reports=[],dialogs=[];
 w.db={clients,lots,sales,contractTexts:documents,residences:[{id:'R',name:'Altos del Arrayán'},{id:'R2',name:'Nueva residencial'}]};
 w.showModal=(...args)=>dialogs.push(args);
 w.getClient=id=>clients.find(c=>c.id===id);
 w.getLot=id=>lots.find(l=>l.id===id);
 w.getSale=id=>sales.find(s=>s.id===id);
 let currentResidence='R';
 w.residence=()=>w.db.residences.find(r=>r.id===currentResidence);
 w.residencePicker=()=>'<div id="residence-picker">Residencial</div>';
 w.header=(t,s,actions)=>'<div class="page-head"><h1>'+t+'</h1><div class="head-actions">'+actions+'</div></div>';
 w.esc=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
 w.ic=()=>'';w.money=n=>'L '+Number(n).toFixed(2);w.fmtDate=x=>x;
 w.downloadExcel=(...args)=>reports.push(args);
 w.contractIntakeOpen=()=>{};
 w.page='contracts';
 w.render=()=>{w.document.body.innerHTML='<div id="app" class="lotigest-shell"><header class="lg-topbar"><div class="lg-top-title"><span>GRUPO H / LOTIGEST</span><strong>'+w.page+'</strong></div><div class="lg-top-tools"></div></header><main class="workspace-inner">'+(w.page==='contracts'?w.contractsPage():'<h1>Clientes</h1>')+'</main></div>';};
 w.document.addEventListener('change',event=>{if(event.target.matches('[data-residence-picker]')){currentResidence=event.target.value;w.render();}});
 w.eval(releaseCore);w.eval(code);w.render();
 return {w,reports,dialogs,close:()=>w.close()};
}
function select(w,id,v){
 const field=w.document.getElementById(id);
 assert.ok(field,'Debe existir '+id);
 field.value=v;
 assert.equal(field.value,v);
 field.dispatchEvent(new w.Event('change',{bubbles:true}));
}
function rows(w){return [...w.document.querySelectorAll('.ct-table tbody tr')].map(el=>el.textContent);}
test('Contratos: etapa, bloque y solar no confunden el Bloque I de etapas diferentes',()=>{
 const {w,close}=boot();
 try{
  assert.equal(rows(w).length,3);
  select(w,'ct-stage','1');
  assert.equal(rows(w).length,1);
  assert.match(rows(w)[0],/Ángela López/);
  select(w,'ct-stage','2');
  select(w,'ct-block','I');
  select(w,'ct-solar','3');
  assert.equal(rows(w).length,1);
  assert.match(rows(w)[0],/Luis Martínez/);
  assert.match(rows(w)[0],/D2/);
  assert.doesNotMatch(rows(w)[0],/S1/);
 }finally{close();}
});
test('Contratos: filtros, contadores y exportación no alteran ventas ni fichas',()=>{
 const {w,reports,close}=boot();
 try{
  const before=JSON.stringify(w.db);
  assert.ok(w.document.querySelector('[data-contract-intake-open]'),'Botón Nuevo contrato');
  assert.ok(w.document.querySelector('[data-contract-owner-manual]'),'Ficha manual');
  assert.ok(w.document.querySelector('[data-contract-owner-open]'),'Asignación de solares');
  assert.equal(w.document.querySelectorAll('.ct-stat').length,4);
  select(w,'ct-status','missing');
  assert.equal(rows(w).length,1);
  assert.match(rows(w)[0],/Sin ficha contractual/);
  w.document.querySelector('[data-ct-export]').click();
  assert.equal(reports.length,1);
  assert.ok(reports[0][0].endsWith('.xlsx'));
  assert.equal(reports[0][2].length,1);
  w.document.querySelector('[data-ct-clear]').click();
  assert.equal(rows(w).length,3);
  assert.equal(JSON.stringify(w.db),before,'Los filtros nunca cambian datos operativos');
 }finally{close();}
});
test('Contratos: vinculación de varios solares aparece en la ubicación',()=>{
 const {w,close}=boot();
 try{
  w.db.contractTexts[0].contractLotIds=['L1','L2'];
  w.render();
  assert.match(w.document.body.textContent,/Otros del mismo grupo/);
  assert.match(w.document.body.textContent,/Solar 3/);
  assert.ok(w.document.querySelector('.ct-tools summary'));
 }finally{close();}
});

test('Contratos: cabecera única mueve residencial, crear, imprimir y exportar a la barra superior',()=>{
 const {w,close}=boot();
 try{
  const topbar=w.document.querySelector('.lg-topbar.ct-topbar');
  assert.ok(topbar,'La cabecera de Contratos utiliza la barra existente de LOTIGEST');
  assert.equal(w.document.querySelectorAll('[data-residence-picker]').length,1,'Residencial aparece una sola vez');
  assert.equal(topbar.querySelector('[data-residence-picker]').value,'R');
  assert.equal(topbar.querySelector('[data-contract-intake-open]')?.textContent.includes('Nuevo contrato'),true);
  assert.ok(topbar.querySelector('[data-ct-print]'));
  assert.ok(topbar.querySelector('[data-ct-export]'));
  assert.equal(w.document.querySelector('.ct-module .page-head'),null,'No ocupa una segunda fila de título');
  assert.equal(w.document.querySelector('.ct-module [data-residence-picker]'),null);
  select(w,'ct-top-residence-select','R2');
  assert.equal(w.document.querySelectorAll('[data-residence-picker]').length,1);
  assert.equal(w.document.querySelector('[data-residence-picker]').value,'R2');
  assert.equal(rows(w).length,0,'Cambiar residencial actualiza las fichas visibles');
  w.page='clients';w.render();
  assert.equal(w.document.querySelector('.ct-topbar'),null,'No altera las demás páginas');
 }finally{close();}
});


test('Al tocar Anulados se filtra la lista, sin ocultarla por búsquedas anteriores',()=>{
 const {w,close}=boot();
 try{
  w.db.contractTexts.push({id:'AN1',residenceId:'R',clientId:'C1',lotId:'L1',status:'voided',
   voidedAt:'2026-11-23T18:30:00Z',voidReason:'Número incorrecto de solar',
   structured:{date:'2026-11-20',stage:1,block:'I',number:'2',price:190000,down:20000}});
  w.render();
  select(w,'ct-stage','2');
  select(w,'ct-solar','3');
  w.document.getElementById('ct-query').value='Luis';
  w.document.getElementById('ct-query').dispatchEvent(new w.Event('input',{bubbles:true}));
  w.document.querySelector('[data-ct-show-voided]').click();
  assert.equal(w.document.getElementById('ct-status').value,'voided');
  assert.equal(w.document.querySelector('[data-ct-show-voided]').getAttribute('aria-pressed'),'true');
  assert.equal(rows(w).length,1);
  assert.match(rows(w)[0],/AN1/);
  assert.match(rows(w)[0],/Solar 2/);
  assert.match(rows(w)[0],/Revisar diferencia/);
  assert.ok(w.document.querySelector('[data-ct-voided-view="AN1"]'));
  assert.equal(w.document.querySelector('[data-contract-edit="AN1"]'),null);
  w.document.querySelector('[data-ct-show-voided]').click();
  assert.equal(w.document.getElementById('ct-status').value,'all');
 }finally{close();}
});
test('Ver anulación revela motivo y ambas ubicaciones en solo lectura sin cambiar datos',()=>{
 const {w,dialogs,close}=boot();
 try{
  w.db.contractTexts.push({id:'AN2',residenceId:'R',clientId:'C1',lotId:'L1',status:'voided',
   voidedAt:'2026-11-23T18:30:00Z',voidedBy:'Administrador',
   voidReason:'Debía ser solar 2 y quedó vinculado el solar 3',
   structured:{stage:1,block:'I',number:'2',date:'2026-11-22',price:199000,down:30000}});
  w.render();
  const initial=JSON.stringify(w.db);
  w.document.querySelector('[data-ct-show-voided]').click();
  w.document.querySelector('[data-ct-voided-view="AN2"]').click();
  assert.equal(dialogs.length,1);
  assert.match(dialogs[0][0],/Consultar contrato anulado/);
  assert.match(dialogs[0][1],/Debía ser solar 2/);
  assert.match(dialogs[0][1],/Solar 3/);
  assert.match(dialogs[0][1],/Solar 2/);
  assert.match(dialogs[0][1],/no coincide/);
  assert.doesNotMatch(dialogs[0][1],/data-contract-edit|data-contract-delete/);
  assert.equal(JSON.stringify(w.db),initial);
 }finally{close();}
});
test('No permite abrir contratos anulados de otra residencial',()=>{
 const {w,dialogs,close}=boot();
 try{
  w.db.contractTexts.push({id:'AN-OTRO',residenceId:'R2',clientId:'C1',lotId:'L1',status:'voided',
   structured:{number:'2'}});
  w.render();
  const button=w.document.querySelector('[data-ct-show-voided]');
  button.click();
  assert.equal(rows(w).length,0);
  assert.equal(dialogs.length,0);
 }finally{close();}
});


test('La ficha anulada propone liberar por solar con permisos, pero bloquea los vendidos',()=>{
 const {w,dialogs,close}=boot();
 try{
  w.db.contractTexts.push({id:'AN-LIB',residenceId:'R',clientId:'C1',lotId:'L1',
   status:'voided',structured:{number:'2'}});
  w.db.contractTexts=w.db.contractTexts.filter(d=>d.id!=='D1');
  w.db.lots[0].status='sold';
  w.contractIntakeAdmin=()=>true;
  w.render();w.document.querySelector('[data-ct-show-voided]').click();
  w.document.querySelector('[data-ct-voided-view="AN-LIB"]').click();
  assert.match(dialogs[0][1],/data-ct-voided-release="AN-LIB"/);
  assert.match(dialogs[0][1],/Desbloquear y quitar del cliente/);
  assert.doesNotMatch(dialogs[0][1],/data-contract-edit/);
  w.db.sales.push({id:'NEW',clientId:'C1',lotId:'L1',price:200000});
  w.document.querySelector('[data-ct-voided-view="AN-LIB"]')?.click();
  assert.doesNotMatch(dialogs[1][1],/data-ct-voided-release="AN-LIB"/);
  assert.match(dialogs[1][1],/venta registrada/);
 }finally{close();}
});


test('Contratos agrupados: la tabla presenta cada solar individual y no el primer solar de todo el grupo',()=>{
 const {w,dialogs,close}=boot();
 try{
  w.db.lots.push({id:'L4',residenceId:'R',stage:1,block:'Comerciales',sourceNumber:'1'});
  w.db.lots.push({id:'L5',residenceId:'R',stage:1,block:'Comerciales',sourceNumber:'2'});
  w.db.contractTexts.push({id:'CM-ANULADO',residenceId:'R',clientId:'C2',lotId:'L5',
   contractLotIds:['L4','L5'],contractGroupId:'GRUPO-COMERCIAL',status:'voided',format:'manual',
   structured:{stage:1,block:'Comerciales',number:'2',price:2360000}});
  w.db.contractTexts.push({id:'CM-ACTIVO',residenceId:'R',clientId:'C2',lotId:'L4',
   contractLotIds:['L4','L5'],contractGroupId:'GRUPO-COMERCIAL',status:'active',format:'manual',
   structured:{stage:1,block:'Comerciales',number:'1',price:2640000}});
  w.render();
  const byId=id=>[...w.document.querySelectorAll('.ct-table tbody tr')].find(x=>x.textContent.includes(id));
  assert.match(byId('CM-ANULADO').textContent,/Vinculado: Etapa 1 \/ Bloque Comerciales \/ Solar 2/);
  assert.match(byId('CM-ANULADO').textContent,/Otros del mismo grupo.*Solar 1/);
  assert.match(byId('CM-ACTIVO').textContent,/Etapa 1 \/ Bloque Comerciales \/ Solar 1/);
  assert.match(byId('CM-ACTIVO').textContent,/Otros del mismo grupo.*Solar 2/);
  const original=JSON.stringify(w.db);
  byId('CM-ANULADO').querySelector('[data-ct-voided-view]').click();
  assert.match(dialogs[0][1],/Terreno vinculado en el inventario.*Solar 2/s);
  assert.match(dialogs[0][1],/Otros solares del mismo grupo.*Solar 1/s);
  assert.doesNotMatch(dialogs[0][1],/data-ct-voided-lot="L4"/);
  assert.equal(JSON.stringify(w.db),original);
 }finally{close();}
});
test('Contratos: discrepancias entre ficha y solar vinculado se advierten sin editar datos',()=>{
 const {w,close}=boot();
 try{
  w.db.contractTexts[1].structured={price:110000,stage:2,block:'I',number:'2'};
  w.render();
  const row=[...w.document.querySelectorAll('.ct-table tbody tr')].find(x=>x.textContent.includes('D2'));
  assert.match(row.textContent,/Solar 3/);
  assert.match(row.textContent,/Según ficha: Etapa 2 \/ Bloque I \/ Solar 2/);
  assert.match(row.textContent,/Revisar diferencia/);
 }finally{close();}
});

test('Reactivación: PIN solo administrador, valida entrada, conserva pagos y rota al usarlo',async()=>{
 const {w,close}=boot();
 try{
  assert.equal(w.document.querySelector('[data-ct-pin-value]'),null);
  w.cloudUser={role:'admin',name:'Admin'};w.contractIntakeAdmin=()=>true;
  w.toast=()=>{};w.cloudWrite=()=>{};w.cloudFlush=async()=>{};
  w.cloudBlocked=false;w.cloudOffline=false;w.cloudQueue={latest:1,confirmed:1};w.closeModal=()=>{};
  w.db.contractTexts[0].status='voided';w.db.contractTexts[0].voidReason='Prueba';
  w.db.lots[0].purchaseFromPlan=true;
  w.db.payments=[{id:'P1',amount:100}];
  let code='1234';w.cloudApi=async(path,options)=>{if(options?.method==='POST'){assert.equal(JSON.parse(options.body).pin,code);code='5678';return {ok:true};}return {pin:code,expires:Date.now()+120000};};
  w.render();await new Promise(resolve=>setTimeout(resolve,0));
  const pin=w.document.querySelector('[data-ct-pin-value]').textContent;
  assert.match(pin,/^\d{4}$/);
  assert.ok(w.document.querySelector('[data-ct-activate="D1"]'));
  w.showModal=(title,body)=>{w.document.body.insertAdjacentHTML('beforeend',body);};
  w.document.querySelector('[data-ct-activate="D1"]').click();
  const form=w.document.querySelector('#ct-activation-form');
  form.elements.pin.value='xxxx';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(w.db.contractTexts[0].status,'voided');
  assert.match(w.document.querySelector('#ct-activation-error').textContent,/incorrecto/);
  form.elements.pin.value=pin;form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(w.db.contractTexts[0].status,'pending-sale');
  assert.equal(w.db.lots[0].pendingContractId,'D1');
  assert.equal(w.db.lots[0].purchaseFromPlan,true,'Reactivar conserva la marca de vendido del plano');
  assert.equal(w.db.contractTexts[0].reactivationHistory[0].by,'Admin');
  assert.equal(w.db.contractTexts[0].voidReason,'Prueba');
  assert.deepEqual(JSON.parse(JSON.stringify(w.db.payments)),[{id:'P1',amount:100}]);
  assert.notEqual(w.document.querySelector('[data-ct-pin-value]').textContent,pin);
  w.cloudUser.role='reader';w.render();
  assert.equal(w.document.querySelector('[data-ct-pin-value]'),null);
 }finally{close();}
});

test('Reactivación bloquea ubicación diferente y otro propietario',()=>{
 const {w,dialogs,close}=boot();
 try{
  const errors=[];w.cloudUser={role:'admin'};w.contractIntakeAdmin=()=>true;w.toast=m=>errors.push(m);
  w.db.contractTexts[0].status='voided';w.db.contractTexts[0].structured.number='2';w.render();
  w.document.querySelector('[data-ct-activate="D1"]').click();assert.match(errors.pop(),/no coincide/);
  delete w.db.contractTexts[0].structured.number;w.db.lots[0].ownerClientId='C2';
  w.document.querySelector('[data-ct-activate="D1"]').click();assert.match(errors.pop(),/otra asignación/);
  assert.equal(dialogs.length,0);assert.equal(w.db.contractTexts[0].status,'voided');
 }finally{close();}
});

test('PIN global, estados sin conexión y pendientes sin exponer un PIN vencido',async()=>{
 const {w,close}=boot();try{w.cloudUser={role:'admin',name:'Admin'};w.cloudOffline=false;w.cloudBlocked=false;w.cloudQueue={latest:1,confirmed:1};w.cloudApi=async()=>({pin:'1234',expires:Date.now()+120000});w.page='clients';w.render();await new Promise(r=>setTimeout(r,0));assert.equal(w.document.querySelector('.lg-top-tools .ct-activation-pin').dataset.state,'online');assert.equal(w.document.querySelector('.workspace-inner .ct-activation-pin'),null);w.cloudOffline=true;w.cloudQueue.latest=2;w.render();const pin=w.document.querySelector('.ct-activation-pin');assert.equal(pin.dataset.state,'offline');assert.doesNotMatch(pin.textContent,/1234/);assert.equal(pin.querySelector('.ct-pin-pending').hidden,false);w.cloudUser.role='reader';w.render();assert.equal(w.document.querySelector('.ct-activation-pin'),null);}finally{close();}
});
