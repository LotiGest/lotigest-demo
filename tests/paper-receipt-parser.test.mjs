import test from 'node:test';
import assert from 'node:assert/strict';
import {extractPaperReceipt} from '../paper-receipt-parser.mjs';

test('recibo rosado Grupo H: lee solo el abono, nunca los dos saldos',()=>{
 const receipt=[
  'GRUPO H RESIDENCIAL ALTOS DEL ARRAYAN',
  'Por Lps. 10,000.00',
  'Dia Mes Año',
  '21 10 2026',
  'Recibí de: PAULA NINOSKA SORIANO',
  'Por concepto de: Abono a primera compra',
  'Saldo Anterior 827,342.00',
  'Abono de hoy: 10,000.00',
  'Saldo Actual 817,342.00',
  'RECIBO DE CAJA CONTROL INTERNO Nº 00006159'
 ].join('\n');
 assert.deepEqual(extractPaperReceipt(receipt),{
   amount:10000,date:'2026-10-21',name:'PAULA NINOSKA SORIANO',concept:'Abono a primera compra',reference:'00006159',warnings:[]
 });
});
test('sin etiqueta de pago no importa el saldo como abono',()=>{
 const receipt=extractPaperReceipt('Saldo anterior: 827,342.00\nSaldo actual: 817,342.00');
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
