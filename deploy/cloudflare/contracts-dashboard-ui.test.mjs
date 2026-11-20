import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const code=readFileSync(new URL('./contracts-dashboard-ui.js',import.meta.url),'utf8');
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
 const reports=[];
 w.db={clients,lots,sales,contractTexts:documents};
 w.getClient=id=>clients.find(c=>c.id===id);
 w.getLot=id=>lots.find(l=>l.id===id);
 w.getSale=id=>sales.find(s=>s.id===id);
 w.residence=()=>({id:'R',name:'Altos del Arrayán'});
 w.residencePicker=()=>'<div id="residence-picker">Residencial</div>';
 w.header=(t,s,actions)=>'<header><h1>'+t+'</h1>'+actions+'</header>';
 w.esc=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
 w.ic=()=>'';w.money=n=>'L '+Number(n).toFixed(2);w.fmtDate=x=>x;
 w.downloadExcel=(...args)=>reports.push(args);
 w.contractIntakeOpen=()=>{};
 w.render=()=>{w.document.body.innerHTML=w.contractsPage();};
 w.eval(code);w.render();
 return {w,reports,close:()=>w.close()};
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
  assert.match(w.document.body.textContent,/1 solares adicionales/);
  assert.ok(w.document.querySelector('.ct-tools summary'));
 }finally{close();}
});
