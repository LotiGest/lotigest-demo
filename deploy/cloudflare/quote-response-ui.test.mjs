import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup,boot,login} from './test-ui.mjs';

test('respuesta de cotización: crédito, contado, validación, PDF y recuperación de propuesta',async()=>{
 const server=await setup(),app=boot(server,undefined,{},html=>html.replace('function quoteRequestMode(',`window.quoteTest={run:code=>eval(code)};function quoteRequestMode(`));
 try{
 await login(app,server);
 const before=JSON.stringify(await server.read());
 app.w.quoteTest.run(`clientRequests=[{id:'SOL-11111111-1111-4111-8111-111111111111',status:'pending',title:'Altos del Arrayán',lotId:'DEMO',createdAt:'2026-11-21',lot:{stage:'2',block:'B',sourceNumber:'08',area:200,status:'available',price:250000},client:{name:'<img src=x onerror=alert(1)>',phone:'+504 00000000',mode:'inquiry',note:'Consulta',proposedDownPayment:30000}}];openClientQuote(clientRequests[0].id);`);
 const f=app.d.querySelector('#client-quote-form');
 assert.ok(app.d.querySelector('.cq-modal .cq-layout'));
 assert.equal(app.d.querySelector('.cq-paper img'),null,'escapar nombres de cliente');
 app.input('[name=price]','250000');app.input('[name=downPayment]','30000');app.input('[name=years]','5');
 assert.match(app.d.querySelector('.cq-paper').textContent,/3,666.67/);
 assert.match(app.d.querySelector('.cq-paper').textContent,/Etapa 2 \/ Bloque B \/ Solar 08/);
 app.change('[name=mode]','cash');
 assert.ok(f.elements.downPayment.disabled);
 assert.match(app.d.querySelector('.cq-paper').textContent,/Pago al contado/);
 assert.doesNotMatch(app.d.querySelector('.cq-paper').textContent,/cuotas estimadas/);
 app.change('[name=mode]','credit');app.input('[name=downPayment]','260000');
 assert.match(app.d.querySelector('#client-quote-summary').textContent,/Revisa el precio/);
 app.input('[name=downPayment]','30000');app.input('[name=validUntil]','2000-01-01');
 assert.match(app.d.querySelector('#client-quote-summary').textContent,/vigencia/);
 app.input('[name=validUntil]','2099-12-31');app.input('[name=message]','MENSAJE DE PRUEBA');
 const q=app.w.quoteTest.run(`clientQuoteDetails(document.querySelector('#client-quote-form'),clientRequests[0])`);
 assert.equal(q.monthly,3666.67);assert.equal(q.message,'MENSAJE DE PRUEBA');
 const pdf=Buffer.from(await app.w.quoteTest.run(`makeClientQuotePdf(quoteRequestMode(clientRequests[0],clientQuoteDetails(document.querySelector('#client-quote-form'),clientRequests[0])),clientQuoteDetails(document.querySelector('#client-quote-form'),clientRequests[0]))`).arrayBuffer()).toString('latin1');
 assert.match(pdf,/Válida hasta/);assert.match(pdf,/Etapa: 2/);assert.match(pdf,/No constituye una reserva/);assert.match(pdf,/MENSAJE DE PRUEBA/);
 app.w.quoteTest.run(`clientSalesApi=async(path,method,payload)=>{window.quoteSaved=payload;return {ok:true}};`);
 await app.w.quoteTest.run(`deliverClientQuote(document.querySelector('#client-quote-form'),'draft')`);
 assert.equal(app.w.quoteSaved.quote.validUntil,'2099-12-31');
 app.w.quoteTest.run(`openClientQuote(clientRequests[0].id)`);
 assert.equal(app.d.querySelector('[name=message]').value,'MENSAJE DE PRUEBA');
 assert.equal(JSON.stringify(await server.read()),before,'no alterar clientes, solares, contratos ni pagos');
 assert.deepEqual(server.errors,[]);
 }finally{app.close();}
});
