import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const modern=readFileSync(new URL('../deploy/cloudflare/payment-modal-ui.js',import.meta.url),'utf8');
const history=readFileSync(new URL('../deploy/cloudflare/historical-payment-modal-ui.js',import.meta.url),'utf8');
const build=readFileSync(new URL('../deploy/cloudflare/build.mjs',import.meta.url),'utf8');
test('fecha actual de Honduras visible al abrir cronograma aunque no exista cliente elegido',()=>{
 assert.match(modern,/Fecha actual de Honduras:/);
 assert.match(modern,/root\.append\(todayNotice\)/);
 assert.match(modern,/businessToday\(\)/);
 assert.match(modern,/pm-today-day/);
 assert.match(modern,/pm-due-day/);
});
test('registro permite usar fecha de hoy y conservar fechas históricas sin sobrescribirlas',()=>{
 assert.match(modern,/dataset\.pmUseToday='true'/);
 assert.match(modern,/entry\.max=businessToday\(\)/);
 assert.match(modern,/dateInput\.value=businessToday\(\)/);
 assert.match(history,/Fecha actual de Honduras:/);
 assert.match(history,/Conserva la fecha original para pagos atrasados/);
});
test('resumen separa prima, saldo a financiar y cuotas efectivamente registradas',()=>{
 assert.match(modern,/Prima acordada \(no es cuota\)/);
 assert.match(modern,/Saldo inicial a financiar \(precio − prima\)/);
 assert.match(modern,/Cuotas cubiertas con recibos \(sin prima\)/);
 assert.match(modern,/Total contabilizado \(prima y demás pagos\)/);
 assert.match(build,/installment-status\.mjs/);
});
