import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const source=await readFile(new URL('./payment-modal-ui.js',import.meta.url),'utf8');
test('reference layout retains the original payment controls and visible client, summary, last payment and calendar',()=>{
 const dom=new JSDOM('<div class="lg-payment-modern"><div class="modal-header"></div><form id="multi-payment-form"><div class="pm-shell"></div></form><div class="modal-footer"><button type="submit" form="multi-payment-form">Guardar abono</button></div></div>',{runScripts:'outside-only'});
 dom.window.eval(`function pmNode(tag,cls='',text){const n=document.createElement(tag);n.className=cls;if(text)n.textContent=text;return n;}function pmCard(title){const card=pmNode('section','pm-card'),h=pmNode('h3','',title),body=pmNode('div','pm-card-body');card.append(h,body);return {card,body};}function pmFold(title,...nodes){const el=pmNode('details'),h=pmNode('summary','',title);el.append(h,...nodes);return el;}`);
 dom.window.eval(source.slice(source.indexOf('function pmCompactSales('),source.indexOf('function pmReferenceRefresh(')));
 const d=dom.window.document,form=d.querySelector('form'),shell=d.querySelector('.pm-shell');
 const node=()=>d.createElement('div'),search=node(),person=node(),last=node(),bar=node(),summary=node(),cal=node(),entry=node(),fields=node();entry.innerHTML='<h3>Abono</h3>';entry.append(fields);
 fields.innerHTML='<div id="pm-amount-slot"><input name="amount"></div><label><input name="receiptRef"></label><div class="pm-date-group"><input name="date"></div><label><textarea name="observation"></textarea></label>';
 const amount=fields.querySelector('[name=amount]'),ref=fields.querySelector('[name=receiptRef]'),date=fields.querySelector('[name=date]');
 dom.window.pmCompactSales(form,shell,search,person,last,bar,summary,cal,entry,fields);
 assert.equal(d.querySelector('[name=amount]'),amount);assert.equal(d.querySelector('[name=receiptRef]'),ref);assert.equal(d.querySelector('[name=date]'),date);
 assert.equal(d.querySelector('.pm-reference-layout').children.length,6);
 assert.ok(d.querySelector('.pm-reference-client').contains(search));assert.ok(d.querySelector('.pm-reference-side').contains(last));assert.ok(d.querySelector('.pm-reference-entry').contains(d.querySelector('button[type=submit]')));
 assert.equal(summary.closest('details'),null);assert.equal(cal.closest('details'),null);
 const more=d.querySelector('.pm-mobile-details-toggle');assert.ok(more);more.click();assert.equal(more.getAttribute('aria-expanded'),'true');assert.ok(d.querySelector('.pm-reference-payment').classList.contains('pm-mobile-expanded'));more.click();assert.equal(more.getAttribute('aria-expanded'),'false');assert.ok(d.querySelector('.pm-reference-calendar').isConnected);dom.window.close();
});
test('mobile solar selection scopes the existing draft and all restores the client selection',()=>{
 const dom=new JSDOM('',{runScripts:'outside-only'});
 dom.window.eval(`var paymentDraft={clientId:'c1',referenceSaleId:'s2',amounts:{s1:'100',s2:'200'}};function pmAssignedSales(){return [{id:'s1'},{id:'s2'}];}`);
 dom.window.eval(source.slice(source.indexOf('function pmIncludeClientSales('),source.indexOf('function pmApplyClientTotal(')));
 dom.window.pmIncludeClientSales();assert.deepEqual(Object.keys(dom.window.paymentDraft.amounts),['s2']);assert.equal(dom.window.paymentDraft.amounts.s2,'200');
 dom.window.paymentDraft.referenceSaleId=null;dom.window.pmIncludeClientSales();assert.deepEqual(Object.keys(dom.window.paymentDraft.amounts).sort(),['s1','s2']);assert.equal(dom.window.paymentDraft.amounts.s1,'');dom.window.close();
});
test('Abonos varios remains visible in primary actions and retains its existing handler',()=>{
 const dom=new JSDOM('<div class="lg-payment-modern"><div class="modal-header"><div></div></div><form id="multi-payment-form"></form><div class="pm-reference-actions"></div></div>',{runScripts:'outside-only'}),w=dom.window,d=w.document;
 w.eval(`function pmNode(tag,cls='',text){const el=document.createElement(tag);el.className=cls;if(text)el.textContent=text;return el;}var cloudBlocked=false,cloudBusy=false,cloudQueue={pending:false,latest:1,confirmed:1},pmActive='sale',opened=null;function pmSales(){return [{id:'sale-1',type:'credit'}]}function balance(){return 100}function closeModal(){}function toast(){throw Error('Unexpected block')}function newPayment(){}`);
 w.lotigestMultiDate={openSale:id=>{w.opened=id;}};
 w.eval(source.slice(source.indexOf('function pmCanLeave('),source.indexOf('function pmIcon(')));
 const modal=d.querySelector('.lg-payment-modern');w.pmHeaderClient(modal,null);
 const button=d.querySelector('.pm-reference-actions .pm-many-client');assert.ok(button);assert.equal(button.hidden,false);assert.equal(button.disabled,true);
 w.pmHeaderClient(modal,{id:'c1',name:'Cliente de prueba'});assert.equal(d.querySelectorAll('.pm-many-client').length,1);assert.equal(button.disabled,false);button.click();assert.equal(w.opened,'sale-1');dom.window.close();
});
