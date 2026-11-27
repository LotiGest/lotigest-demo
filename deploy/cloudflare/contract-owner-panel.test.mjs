import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setup,boot,login,until,saved} from './test-ui.mjs';
import {mixedOwnerFixture} from '../../tests/mixed-owner-fixture.mjs';

test('mixed owner receipts use the compact contract panel, show paid prima, calendar, five real receipts and preserve storage',async()=>{
 const server=await setup();let app=boot(server);
 try{
  await login(app,server);const snapshot=await server.read(),mixed=mixedOwnerFixture(snapshot.state.currentResidence||snapshot.state.residences[0].id);
  const next={...snapshot.state};for(const key of ['clients','lots','sales','contractTexts','ownershipStatements','ownerPayments'])next[key]=[...(next[key]||[]),...mixed[key]];
  const write=await server.write({state:next,revision:snapshot.revision,mutation:randomUUID()});assert.equal(write.status,200,await write.text());
  app.close();app=boot(server);await login(app,server);
  const initial=await server.read(),ownerBefore=JSON.stringify(initial.state.ownerPayments),paymentsBefore=JSON.stringify(initial.state.payments),writes=server.writes;
  app.click('[data-page=payments]');await until(()=>app.d.querySelector('#owner-payment-search'));
  app.input('#owner-payment-search','CLIENTE FICTICIO');app.click('[data-action=owner-payment-person][data-id="C-QA"]');
  await until(()=>app.d.querySelector('#multi-payment-form'),'normal contract form');
  assert.equal(app.d.querySelector('#owner-abono-form'),null);assert.ok(app.d.querySelector('.pm-reference-payment'));
  assert.equal(app.d.querySelectorAll('#multi-payment-selected [data-payment-amount]').length,2);
  const summary=label=>{const row=[...app.d.querySelectorAll('#pm-summary .pm-summary-row')].find(row=>row.querySelector('span')?.textContent===label);assert.ok(row,label);return row.querySelector('strong').textContent.replace(/\D/g,'');};
  assert.equal(summary('Prima acordada (no es cuota)'),'10522736');assert.equal(summary('Prima aplicada en la contabilidad'),'10522736');assert.equal(summary('Prima faltante'),'000');
  assert.equal(summary('Total contabilizado (prima y demás pagos)'),'11689136');assert.equal(summary('Saldo restante actual'),'93938164');
  assert.match(app.d.querySelector('#pm-last-payment').textContent,/7155/);assert.doesNotMatch(app.d.querySelector('#pm-last-payment').textContent,/no desglosado/);
  assert.match(app.d.querySelector('#pm-calendar-body').textContent,/Cuotas cubiertas/);
  app.click('[data-pm-reports-open]');[...app.d.querySelectorAll('.pm-report-option button')].find(b=>b.textContent==='Abrir historial').click();
  const history=app.d.querySelector('.pm-history-window');assert.ok(history);
  for(const ref of ['7151','7152','7153','7154','7155'])assert.match(history.textContent,new RegExp(ref));
  assert.equal(history.querySelectorAll('[data-action="owner-payment-receipt"]').length,5);
  const current=await server.read();assert.equal(JSON.stringify(current.state.ownerPayments),ownerBefore);assert.equal(JSON.stringify(current.state.payments),paymentsBefore);assert.equal(server.writes,writes,'viewing never posts duplicate payments');
  // Close reports, then verify a new payment can be stored without leaking virtual rows.
  [...history.querySelectorAll('button')].find(b=>b.textContent.includes('Cerrar')).click();
  app.input('#pm-client-total','100');app.input('[name=receiptRef]','880001');app.change('#multi-payment-form [name=date]','2026-09-06');app.submit('#multi-payment-form');
  await until(async()=>((await server.read()).state.payments||[]).some(p=>p.receiptReference==='880001'),'new installment persisted');await saved(app);
  const stored=(await server.read()).state;assert.equal(JSON.stringify(stored.ownerPayments),ownerBefore);assert.equal(stored.payments.filter(p=>p.receiptReference==='880001').length,2);assert.equal(stored.payments.some(p=>p.contractOwnerView),false);app.d.querySelector('[data-action=close-modal]')?.click();app.click('[data-page=finance]');assert.equal(app.d.querySelector('.fn-kpi strong').textContent.replace(/\D/g,''),'11699136','income is counted once, including the new L 100');assert.deepEqual(server.errors,[]);
 }finally{app.close();}
});
