import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../deploy/cloudflare/global-money-ui.js',import.meta.url),'utf8');
test('1000 calendar/text updates avoid full input rescans, while new money fields and programmatic totals stay synchronized',async()=>{
 const dom=new JSDOM('<form><label>Precio<input name="price" type="number" value="1000"></label></form><section id="calendar"></section>',{runScripts:'outside-only'}),w=dom.window,d=w.document;
 try{
  w.eval(source);w.lotigestMoney.scan();await new Promise(resolve=>setTimeout(resolve,0));
  let scans=0;const original=d.querySelectorAll.bind(d);d.querySelectorAll=function(selector){if(selector==='input')scans++;return original(selector);};
  d.getElementById('calendar').innerHTML=Array.from({length:1000},(_,i)=>'<div>Mes '+i+' · L 100.00</div>').join('');await new Promise(resolve=>setTimeout(resolve,0));assert.equal(scans,0);
  const raw=d.querySelector('[name=price]'),visible=raw.closest('.lg-money-control').querySelector('[data-lg-money-display]');raw.value='2500.50';await new Promise(resolve=>setTimeout(resolve,0));assert.equal(visible.value,'2,500.50');assert.equal(scans,0,'updating a known total synchronizes only that field');
  raw.readOnly=true;await new Promise(resolve=>setTimeout(resolve,0));assert.equal(visible.readOnly,true);
  d.querySelector('form').insertAdjacentHTML('beforeend','<label>Monto<input name="amount" type="number" required></label>');await new Promise(resolve=>setTimeout(resolve,0));assert.equal(scans,1);assert.ok(d.querySelector('[name=amount]').closest('.lg-money-control'));
 }finally{dom.window.close();}
});
