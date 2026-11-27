import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setup,boot,login,until,saved} from './test-ui.mjs';
import {mixedOwnerFixture} from '../../tests/mixed-owner-fixture.mjs';
test('pending contract shows activation in Abonos, preserves paid prima, and returns to the credit form without a duplicate payment',async()=>{
 const server=await setup();let app=boot(server);
 try{
  await login(app,server);const snapshot=await server.read(),m=mixedOwnerFixture(snapshot.state.currentResidence);
  m.lots=m.lots.slice(0,1);m.sales=[];m.contractTexts=m.contractTexts.slice(0,1);
  const doc=m.contractTexts[0];doc.status='pending-sale';doc.saleId='';delete doc.voidedAt;
  m.ownershipStatements[0].references=m.ownershipStatements[0].references.slice(0,1);
  m.ownerPayments=m.ownerPayments.slice(0,1);const p=m.ownerPayments[0];p.amountCents=5261368;p.allocations[0].amountCents=p.amountCents;p.allocations[0].references=p.allocations[0].references.slice(0,1);
  const next={...snapshot.state};for(const key of ['clients','lots','sales','contractTexts','ownershipStatements','ownerPayments'])next[key]=[...(next[key]||[]),...m[key]];
  const r=await server.write({state:next,revision:snapshot.revision,mutation:randomUUID()});assert.equal(r.status,200,await r.text());
  app.close();app=boot(server);await login(app,server);
  const before=await server.read(),writes=server.writes;
  app.click('[data-page=payments]');await until(()=>app.d.querySelector('#owner-payment-search'));
  app.input('#owner-payment-search','CLIENTE FICTICIO');app.click('[data-action=owner-payment-person][data-id="C-QA"]');
  await until(()=>app.d.querySelector('.pm-pending-credit'));
  const amount=app.d.querySelector('.pm-owner-allocations'),fields=app.d.querySelector('#owner-abono-form .pm-fields');
  assert.ok(amount.compareDocumentPosition(fields)&app.w.Node.DOCUMENT_POSITION_FOLLOWING);
  assert.equal(server.writes,writes);
  app.click('[data-contract-intake-activate]');
  assert.match(app.d.querySelector('.modal-content').textContent,/Prima registrada: L\.\s*52,613\.68/);
  app.submit('#contract-intake-activate-form');
  await until(()=>app.d.querySelector('#multi-payment-form'),'credit form');await saved(app);
  const after=await server.read();
  assert.equal(after.state.contractTexts.find(d=>d.id===doc.id).status,'active');
  assert.deepEqual(after.state.ownerPayments,before.state.ownerPayments);
  assert.deepEqual(after.state.payments,before.state.payments);
  assert.equal(after.state.sales.filter(s=>s.clientId==='C-QA').length,1);
  assert.match(app.d.querySelector('#pm-summary').textContent,/52,613\.68/);
  assert.deepEqual(server.errors,[]);
 }finally{app.close();}
});
