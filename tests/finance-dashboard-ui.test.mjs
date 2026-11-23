import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {financeJournal,financeJournalPdf} from '../finance-journal.mjs';
const html=readFileSync(new URL('../prueba-diseno-v08.html',import.meta.url),'utf8');
const original=html.slice(html.indexOf('const financeMonthNames='),html.indexOf('function financeEntryForm('));
const ui=readFileSync(new URL('../deploy/cloudflare/finance-dashboard-ui.js',import.meta.url),'utf8');
function boot(){
 const dom=new JSDOM('<main id="main"></main>',{runScripts:'outside-only'}),w=dom.window;
 let excel,pdf;
 w.db={company:{name:'GRUPO H'},clients:[{id:'C',name:'DELMI'}],residences:[{id:'R',name:'Arrayán'},{id:'R2',name:'Otra'}],lots:[{id:'L1',residenceId:'R'},{id:'L2',residenceId:'R2'}],sales:[{id:'S1',lotId:'L1',clientId:'C'},{id:'S2',lotId:'L2',clientId:'C'}],payments:[{id:'OLD',saleId:'S1',date:'2026-10-01',amount:1000},{id:'P1',saleId:'S1',date:'2026-11-03',amount:12000},{id:'P2',saleId:'S2',date:'2026-11-05',amount:2000},{id:'VOID',saleId:'S1',date:'2026-11-05',amount:999,voidedAt:'now'}],ownerPayments:[{id:'OP',residenceId:'R',clientName:'DELMI',date:'2026-11-06',amountCents:500000,receiptReference:'0060'},{id:'OV',residenceId:'R',date:'2026-11-06',amountCents:99900,status:'voided'}],cashEntries:[{id:'FUEL',residenceId:'R',date:'2026-11-05',amount:2500,kind:'expense',category:'Combustible',description:'Combustible'}],historicalPayments:[{id:'UNPOSTED',amountCents:900000,date:'2026-11-01'}]};
 w.businessToday=()=> '2026-11-23';w.validSolarDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s);w.getClient=id=>w.db.clients.find(c=>c.id===id);w.residenceName=id=>w.db.residences.find(r=>r.id===id)?.name||'General';
 w.esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');w.money=n=>'L '+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});w.fmtDate=s=>s;w.header=(title,subtitle,tools)=>'<h1>'+title+'</h1><p>'+subtitle+'</p>'+tools;
 w.financeJournal=financeJournal;w.financeJournalPdf=financeJournalPdf;w.toast=message=>{throw Error(message);};w.downloadExcel=(...args)=>excel=args;w.download=(...args)=>pdf=args;
 const captured="const residentialFinanceReport=financeReport;const capturedMovements=financeMovements;financeMovements=()=>[...capturedMovements(),...db.ownerPayments.map(p=>({id:'owner:'+p.id,paymentId:p.id,kind:'income',date:p.date,amount:p.amountCents/100,residenceId:p.residenceId,description:'Abono de propietario',category:'Abono',reference:p.id}))];";
 w.eval(original+captured+ui+';window.testFinanceFilter=financeFilter;');w.render=()=>{w.document.getElementById('main').innerHTML=w.financePage();};w.render();
 return {w,getExcel:()=>excel,getPdf:()=>pdf,close:()=>w.close()};
}
test('panel usa movimientos reales, total histórico y una gráfica con 2 series',()=>{
 const {w,close}=boot();try{
  const before=JSON.stringify(w.db),cards=[...w.document.querySelectorAll('.fn-kpi strong')].map(e=>e.textContent);
  assert.deepEqual(cards,['L 20,000.00','L 19,000.00','L 2,500.00','L 16,500.00']);
  assert.equal(w.document.querySelectorAll('.fn-chart svg').length,1);assert.equal(w.document.querySelectorAll('[data-finance-series]').length,2);
  assert.equal(w.document.querySelector('[data-fn-scope]').options.length,4);assert.equal(JSON.stringify(w.db),before);
  const search=w.document.querySelector('[data-fn-search]');search.value='Combustible';search.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(w.document.querySelectorAll('#fn-transactions tbody tr').length,1);
 }finally{close();}
});
test('libro mensual descarga Excel numérico y PDF con filtros coincidentes',async()=>{
 const {w,getExcel,getPdf,close}=boot();try{
  const scope=w.document.querySelector('[data-fn-scope]');scope.value='R';scope.dispatchEvent(new w.Event('change',{bubbles:true}));
  w.document.querySelector('[data-fn-excel]').click();const [name,headers,rows]=getExcel();assert.match(name,/2026-11.xlsx$/);assert.ok(headers.includes('Saldo (L)'));
  assert.equal(rows[0][7],1000);assert.equal(rows.at(-1)[5],17000);assert.equal(rows.at(-1)[6],2500);assert.equal(rows.at(-1)[7],15500);assert.equal(rows.length,5);
  w.document.querySelector('[data-fn-pdf]').click();const [pdfName,blob]=getPdf();assert.match(pdfName,/2026-11.pdf$/);assert.equal(blob.type,'application/pdf');const raw=Buffer.from(await blob.arrayBuffer()).toString('latin1');assert.match(raw,/17,000.00/);assert.match(raw,/15,500.00/);assert.doesNotMatch(raw,/RECIBO DE PAGO/);
  w.testFinanceFilter.period='yearly';w.render();w.document.querySelector('[data-fn-excel]').click();assert.equal(getExcel()[2].at(-1)[5],17000,'El libro sigue siendo mensual aunque la gráfica sea anual');
 }finally{close();}
});
