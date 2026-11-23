import test from 'node:test';
import assert from 'node:assert/strict';
import {extractPaperReceipt} from '../paper-receipt-parser.mjs';

test('recibo rosado Grupo H: lee solo el abono, nunca los dos saldos',()=>{
 const receipt=[
  'GRUPO H RESIDENCIAL ALTOS DEL ARRAYAN',
  'Por Lps. 10,000.00',
  'Dia Mes Año',
  '12 06 2025',
  'Recibí de: CLIENTE DE PRUEBA',
  'Por concepto de: Abono a primera compra',
  'Saldo Anterior 50,000.00',
  'Abono de hoy: 10,000.00',
  'Saldo Actual 40,000.00',
  'RECIBO DE CAJA CONTROL INTERNO Nº 00001234'
 ].join('\n');
 assert.deepEqual(extractPaperReceipt(receipt),{
   amount:10000,date:'2025-06-12',name:'CLIENTE DE PRUEBA',concept:'Abono a primera compra',reference:'00001234',warnings:[]
 });
});
test('sin etiqueta de pago no importa el saldo como abono',()=>{
 const receipt=extractPaperReceipt('Saldo anterior: 50,000.00\nSaldo actual: 40,000.00');
 assert.equal(receipt.amount,null);
 assert.ok(receipt.warnings.length>0);
});
test('importes de pago contradictorios exigen revisión humana',()=>{
 const receipt=extractPaperReceipt('Por Lps. 10,000.00\nAbono de hoy: 9,000.00\nNo. 00006160');
 assert.equal(receipt.amount,null);
 assert.match(receipt.warnings[0],/varios importes/i);
});
test('acepta fechas antiguas y separadores hondureños',()=>{
 const receipt=extractPaperReceipt('Fecha de pago: 21/05/2024\nPor Lps.: 1.250,50\nNº 00006200');
 assert.equal(receipt.amount,1250.50);assert.equal(receipt.date,'2024-05-21');
});

test('tres campos del recibo de caja de Grupo H para abonos por fecha',()=>{
 const receipt=extractPaperReceipt([
  'GRUPO H',
  'Residencial ALTOS DEL ARRAYAN',
  'Por Lps. 12,000.00',
  'Día Mes Año',
  '22 11 2026',
  'Recibí de: CLIENTE DEMOSTRACION',
  'Saldo anterior 827,342.00',
  'Abono de hoy: 12,000.00',
  'Saldo actual 815,342.00',
  'RECIBO DE CAJA CONTROL INTERNO Nº 00006159'
 ].join('\n'));
 assert.equal(receipt.amount,12000);
 assert.equal(receipt.date,'2026-11-22');
 assert.equal(receipt.reference,'00006159');
 assert.equal(receipt.warnings.length,0);
});
