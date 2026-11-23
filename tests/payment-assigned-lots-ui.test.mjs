import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../deploy/cloudflare/payment-modal-ui.js',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('function pmAssignedSales('),source.indexOf('function pmRepaintSales('));
test('asignados muestra ambos solares aunque solo uno esté seleccionado y no cambia montos',()=>{
 const dom=new JSDOM('<div id="tags"></div>'),document=dom.window.document;
 const lots=[{id:'L1',residenceId:'R',stage:1,block:'Comerciales',sourceNumber:'1'},
  {id:'L2',residenceId:'R',stage:1,block:'Comerciales',sourceNumber:'2'},
  {id:'OTHER',residenceId:'OTHER',stage:1,sourceNumber:'3'}];
 const sales=[{id:'S2',lotId:'L2',clientId:'DELMI'},{id:'S1',lotId:'L1',clientId:'DELMI'},
  {id:'S3',lotId:'OTHER',clientId:'DELMI'},{id:'S4',lotId:'L1',clientId:'OTHER'}];
 const paymentDraft={residenceId:'R',clientId:'DELMI',amounts:{S2:'1000'}};
 const node=(tag,cls='',text='')=>{const el=document.createElement(tag);el.className=cls;el.textContent=text;return el;};
 const env={paymentDraft,paymentCandidates:()=>sales,getLot:id=>lots.find(l=>l.id===id),
  pmSales:()=>sales.filter(s=>Object.hasOwn(paymentDraft.amounts,s.id)),pmBadge:text=>node('span','pm-tag',text),pmNode:node};
 const {pmRenderAssignedLots}=new Function(...Object.keys(env),helpers+';return {pmRenderAssignedLots};')(...Object.values(env));
 try{
  const tags=document.getElementById('tags'),before=JSON.stringify(paymentDraft);
  pmRenderAssignedLots(tags,'DELMI');assert.equal(tags.children.length,2);
  assert.match(tags.children[0].textContent,/Solar 1/);assert.match(tags.children[1].textContent,/Solar 2/);
  assert.equal(tags.querySelector('[data-id="S1"]').dataset.action,'multi-payment-add');
  assert.equal(tags.querySelector('[data-id="S2"]').dataset.action,'multi-payment-remove');
  assert.equal(JSON.stringify(paymentDraft),before);
  delete paymentDraft.amounts.S2;pmRenderAssignedLots(tags,'DELMI');
  assert.equal(tags.children.length,2);assert.equal(tags.querySelectorAll('[data-action="multi-payment-add"]').length,2);
 }finally{dom.window.close();}
});
