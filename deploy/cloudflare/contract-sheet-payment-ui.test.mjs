import test from 'node:test';import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';
import {setup,boot,login,until,saved} from './test-ui.mjs';
test('ficha PDF de datos existentes y abonos: mensualidad visible, abono parcial y faltante completado',async()=>{
 const server=await setup();let app=boot(server);
 try{
  await login(app,server);const snapshot=await server.read(),s=snapshot.state,rid=s.currentResidence||s.residences[0].id;
  s.clients.push({id:'PDF-C',name:'CLIENTE FICTICIO DE PRUEBA',identity:'0801 1990 00021',address:'DIRECCIÓN DE PRUEBA',maritalStatus:'SOLTERO'});
  s.lots.push({id:'PDF-L',residenceId:rid,stage:2,block:'G',sourceNumber:'16',area:176,areaVaras2:252.42,status:'sold',ownerClientId:'PDF-C'});
  s.sales.push({id:'PDF-V',clientId:'PDF-C',lotId:'PDF-L',type:'credit',price:580564.16,downPayment:58056.42,months:84,date:'2024-01-01',firstDueDate:'2024-02-01'});
  s.payments.push({id:'PDF-PRIMA',saleId:'PDF-V',amount:58056.42,date:'2024-01-01',concept:'Prima',method:'Efectivo'});
  s.contractTexts??=[];s.contractTexts.push({id:'PDF-D',clientId:'PDF-C',lotId:'PDF-L',saleId:'PDF-V',residenceId:rid,format:'photo+ocr',status:'active',pages:[],structured:{price:580564.16,down:58056.42,months:84,north:'CALLE DE ACCESO DE 8 METROS DE ANCHO',south:'LOTE G-3',east:'LOTE G-15',west:'LOTE G-17',pricePerVara:2300,observations:'REPRESENTANTE FICTICIO. DATOS DE PRUEBA SIN INFORMACIÓN PERSONAL.'}});
  const result=await server.write({state:s,revision:snapshot.revision,mutation:crypto.randomUUID()});assert.equal(result.status,200,await result.text());app.close();app=boot(server);
  await until(()=>app.d.querySelector('[data-page=clients]'),'sesión existente');
  app.click('[data-page=clients]');app.click('[data-action=view-client][data-id="PDF-C"]');
  let pdf;app.w.URL.createObjectURL=blob=>{pdf=blob;return 'blob:sheet';};app.w.URL.revokeObjectURL=()=>{};app.d.addEventListener('click',event=>{if(event.target.closest('a[download]'))event.preventDefault();});
  app.click('[data-client-sheet="PDF-C"]');assert.ok(pdf);const bytes=Buffer.from(await pdf.arrayBuffer()),text=bytes.toString('latin1');
  assert.match(text,/CLIENTE FICTICIO DE PRUEBA/);assert.match(text,/0801 1990 00021/);assert.match(text,/6,220.33/);assert.match(text,/COLINDANCIAS/);assert.doesNotMatch(text,/PAGO RECIBIDO/);
  if(process.env.LOTIGEST_PDF_PREVIEW)await writeFile(process.env.LOTIGEST_PDF_PREVIEW,bytes);
  app.click('[data-action=close-modal]');app.click('[data-page=payments]');app.click('[data-action=payment-options]');
  if(app.d.querySelector('#owner-payment-search')){app.input('#owner-payment-search','CLIENTE FICTICIO');app.click('[data-action=owner-payment-person][data-id="PDF-C"]');}
  if(!app.d.querySelector('#pm-amount-slot [data-payment-amount]'))app.click('[data-action=multi-payment-add][data-id="PDF-V"]');
  assert.match(app.d.querySelector('[data-monthly-banner]').textContent,/6,220.33/);
  app.input('#pm-amount-slot [data-pm-currency]','5000');app.submit('#multi-payment-form',{date:'2024-02-01',concept:'Abono de prueba',receiptRef:'880001'});
  await until(()=>app.d.querySelector('.lg-partial-dialog'),'confirmación del abono inferior');assert.equal((await server.read()).state.payments.filter(p=>p.saleId==='PDF-V').length,1);app.click('[data-partial-apply]');await until(async()=>((await server.read()).state.payments||[]).some(p=>p.receiptReference==='880001'),'abono parcial persistido');
  await saved(app);assert.equal((await server.read()).state.payments.filter(p=>p.saleId==='PDF-V').length,2);
  app.d.querySelector('[data-action=close-modal]')?.click();app.click('[data-page=payments]');await until(()=>app.d.querySelector('#multi-payment-form,#owner-payment-search'));
  if(app.d.querySelector('#owner-payment-search')){app.input('#owner-payment-search','CLIENTE FICTICIO');app.click('[data-action=owner-payment-person][data-id="PDF-C"]');}
  if(!app.d.querySelector('#pm-amount-slot [data-payment-amount]'))app.click('[data-action=multi-payment-add][data-id="PDF-V"]');
  app.input('#pm-amount-slot [data-pm-currency]','1220.33');app.submit('#multi-payment-form',{date:'2024-02-01',concept:'Abono de prueba',receiptRef:'880002'});await until(()=>app.d.querySelector('.lg-partial-dialog'),'confirmación del faltante');app.click('[data-partial-apply]');await until(async()=>((await server.read()).state.payments||[]).some(p=>p.receiptReference==='880002'),'faltante persistido');await saved(app);
  assert.equal((await server.read()).state.payments.filter(p=>p.saleId==='PDF-V').length,3);assert.deepEqual(server.errors,[]);
 }finally{app.close();}
});
