import test from 'node:test';
import assert from 'node:assert/strict';
import {financeJournal,financeJournalPdf} from '../finance-journal.mjs';
test('libro mensual ordena, excluye anulados y concilia saldos en centavos',()=>{
 const rows=[{id:'OLD',date:'2026-10-01',kind:'income',amount:100.01,residenceId:'R'},
  {id:'P',date:'2026-11-03',kind:'income',amount:10.02,residenceId:'R'},
  {id:'G',date:'2026-11-01',kind:'expense',amount:5.03,residenceId:'R'},
  {id:'VOID',date:'2026-11-01',kind:'income',amount:999,residenceId:'R',voidedAt:'now'},
  {id:'CANCEL',date:'2026-11-01',kind:'income',amount:999,residenceId:'R',status:'cancelled'},
  {id:'NEXT',date:'2026-12-01',kind:'income',amount:999,residenceId:'R'},
  {id:'OTHER',date:'2026-11-03',kind:'income',amount:999,residenceId:'OTHER'}];
 const before=JSON.stringify(rows),j=financeJournal(rows,{from:'2026-11-01',until:'2026-12-01',residenceId:'R'});
 assert.deepEqual(j.rows.map(e=>e.id),['G','P']);assert.equal(j.opening,100.01);assert.equal(j.income,10.02);assert.equal(j.expense,5.03);assert.equal(j.closing,105);assert.equal(j.rows[0].balance,94.98);assert.equal(JSON.stringify(rows),before);
});
test('PDF descarga directa con paginación, español y referencias completas',async()=>{
 const rows=Array.from({length:140},(_,i)=>({id:'INTERNAL-'+i,correlative:'REF-'+i,date:'2026-11-03',kind:'income',amount:10,residenceId:'R',description:'Combustible y maquinaria · revisión '+i}));
 const j=financeJournal(rows,{from:'2026-11-01',until:'2026-12-01'}),blob=financeJournalPdf(j,{period:'Noviembre 2026',company:'GRUPO H',scope:'Altos del Arrayán'});
 assert.equal(blob.type,'application/pdf');const raw=Buffer.from(await blob.arrayBuffer()).toString('latin1');
 assert.ok(raw.startsWith('%PDF-1.4'));assert.match(raw,/LIBRO DIARIO DIGITAL/);assert.match(raw,/Arrayán/);assert.match(raw,/REF-139/);assert.match(raw,/L 1,400.00/);
 const count=Number(raw.match(/\/Type \/Pages \/Count (\d+)/)[1]);assert.ok(count>1);
 const offset=Number(raw.match(/startxref\n(\d+)/)[1]);assert.equal(raw.slice(offset,offset+4),'xref');
 const entries=raw.slice(offset).split('\n').slice(3).filter(l=>/^\d{10} 00000 n/.test(l));
 entries.forEach((line,i)=>assert.ok(raw.slice(Number(line.slice(0,10))).startsWith((i+1)+' 0 obj')));
});
test('mes vacío conserva saldo inicial y exporta PDF válido',async()=>{
 const j=financeJournal([{id:'OLD',date:'2026-01-01',kind:'income',amount:500,residenceId:'R'}],{from:'2026-11-01',until:'2026-12-01'});
 assert.equal(j.rows.length,0);assert.equal(j.closing,500);
 const raw=Buffer.from(await financeJournalPdf(j).arrayBuffer()).toString('latin1');assert.match(raw,/No hay movimientos/);assert.match(raw,/L 500.00/);
});

test('columna Correlativo conserva ceros y nunca usa identificadores internos',async()=>{
 const rows=[{id:'INTERNAL-HIDDEN',date:'2026-11-01',kind:'income',amount:100,income:100,expense:0,balance:100,correlative:'00006159',description:'Abono'},
 {id:'INTERNAL-NO-CODE',date:'2026-11-02',kind:'expense',amount:10,income:0,expense:10,balance:90,description:'Combustible'}];
 const blob=financeJournalPdf({rows,opening:0,income:100,expense:10,closing:90},{period:'Noviembre 2026',from:'2026-11-01',to:'2026-11-30'});
 const raw=Buffer.from(await blob.arrayBuffer()).toString('latin1');
 assert.match(raw,/Correlativo/);assert.match(raw,/00006159/);assert.match(raw,/Sin[\s\S]*correlativo/);assert.doesNotMatch(raw,/INTERNAL/);assert.match(raw,/01\/11\/2026 al 30\/11\/2026/);assert.match(raw,/Elaborado por/);assert.match(raw,/Revisado por/);assert.match(raw,/Página 1 de 1/);
});
