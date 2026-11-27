import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup,boot,login} from './test-ui.mjs';

test('plantillas y exportaciones descargan XLSX válido con enlace persistente incluso sin pagos',async()=>{
 const server=await setup(),app=boot(server);try{
  await login(app,server);let blob;const errors=[];app.w.addEventListener('error',e=>errors.push(e.message));
  app.w.URL.createObjectURL=b=>{blob=b;return 'blob:excel-download';};
  app.d.addEventListener('click',e=>{if(e.target.closest('a[download]'))e.preventDefault();});
  async function workbook(action,expected){blob=null;app.click(action);assert.ok(blob,'se genera el archivo: '+JSON.stringify(errors)+' '+app.d.querySelector('#modal-root')?.textContent+' '+app.d.querySelector('#toast-root')?.textContent);assert.equal(blob.type,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');const link=app.d.querySelector('#excel-download-ready a[download]');assert.ok(link);assert.match(link.download,/\.xlsx$/);assert.equal(link.getAttribute('href'),'blob:excel-download');const bytes=new Uint8Array(await blob.arrayBuffer());assert.equal(bytes[0],80);assert.equal(bytes[1],75);const read=app.w.eval('readExcelRows');const sheets=await read({arrayBuffer:()=>blob.arrayBuffer()});assert.deepEqual(Array.from(sheets[0].rows[0]),expected);return sheets[0].rows;}
  app.click('[data-page=lots]');await workbook('[data-action=lot-measures-template]',['Codigo','Etapa','Bloque','Solar','Tipo','Nombre','Identidad','Telefono','Direccion','Precio','Area_m2','Frente','Fondo','Lateral_izquierdo','Lateral_derecho','Croquis']);
  app.click('[data-import-hub-open]');app.click('[data-import-hub-mode=buyers]');await workbook('[data-import-hub-template=buyers]',['Codigo','Bloque','Numero','Tipo','Nombre','Identidad','Telefono','Direccion','Modalidad','Precio','Prima','Plazo_meses','Cuotas_pagadas','Fecha_venta','Primera_cuota']);app.click('[data-action=close-modal]');
  await workbook('[data-action=inventory-excel]',['Codigo','Etapa','Bloque','Solar','Tipo','Nombre','Identidad','Telefono','Direccion','Precio','Area_m2','Frente','Fondo','Lateral_izquierdo','Lateral_derecho','Croquis']);
  app.click('[data-page=collections]');app.click('[data-import-hub-open]');app.click('[data-import-hub-mode=payments]');const headers=['CLIENTE','ETAPA','BLOQUE','SOLARES','FECHA DE PAGO','MONTO (L)','TIPO DE PAGO','ESTADO','ID CONTRATO'];await workbook('[data-import-hub-template=payments]',headers);app.click('[data-action=close-modal]');
  const payments=await workbook('[data-action=payments-excel]',['Fecha','Cliente','Identidad','Residencial','Etapa','Bloque','Solar(es)','Tipo de pago','Monto (L)','Método','Recibo / Referencia','Observaciones']);assert.equal(payments.length,1);assert.match(app.d.querySelector('#excel-download-ready').textContent,/0 filas de clientes\/solares y 0 movimientos|encabezados/);
  await workbook('[data-action=debt-csv]',['Residencial','Etapa','Bloque','Solar','Estado','Cliente','Teléfono','Mes','Pendiente del mes (L)','Total vencido (L)','Cuotas vencidas','Meses vencidos','Primer vencimiento','Saldo del crédito (L)']);
  app.click('[data-import-hub-open]');app.click('[data-import-hub-mode=payments]');await workbook('#modal-root [data-import-hub-template=payments]',headers);
  assert.deepEqual(errors,[]);assert.deepEqual(server.errors,[]);
 }finally{app.close();}
});
