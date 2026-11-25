import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../deploy/cloudflare/payment-last-date-ui.js',import.meta.url),'utf8');
const modal=readFileSync(new URL('../deploy/cloudflare/payment-modal-ui.js',import.meta.url),'utf8');
const style=readFileSync(new URL('../deploy/cloudflare/payment-modal.css',import.meta.url),'utf8');
const build=readFileSync(new URL('../deploy/cloudflare/build.mjs',import.meta.url),'utf8');

const lots={
 a:{id:'a',residenceId:'R1',stage:1,block:'B',sourceNumber:'12'},
 b:{id:'b',residenceId:'R1',stage:2,block:'B',sourceNumber:'12'},
 x:{id:'x',residenceId:'R2',stage:1,block:'C',sourceNumber:'4'}
};
function mock(){
 const db={
  sales:[{id:'s1',clientId:'c1',lotId:'a'},{id:'s2',clientId:'c1',lotId:'b'},{id:'s3',clientId:'c2',lotId:'x'}],
  payments:[
   {id:'p1',saleId:'s1',date:'2026-09-10',amount:2500},
   {id:'p2',saleId:'s2',date:'2026-10-12',amount:2500},
   {id:'p3',saleId:'s2',date:'2026-12-01',amount:2500,voidedAt:'2026-12-02'},
   {id:'p4',saleId:'s3',date:'2026-12-10',amount:2500}],
  ownerPayments:[],
  historicalPayments:[{clientId:'c1',residenceId:'R1',date:'2026-12-15',amountCents:250000}]
 };
 const root={children:[],replaceChildren(){this.children=[];},append(...nodes){this.children.push(...nodes);}};
 const env={
  db,getLot:id=>lots[id],
  pmNode:(tag,cls='',textContent='')=>({tag,cls,textContent,children:[],append(...nodes){this.children.push(...nodes);}}),
  document:{getElementById:id=>id==='pm-last-payment'?root:null},
  pmReadableDate:d=>d
 };
 const {pmLatestClientPayments,pmUpdateLastPayment}=new Function(...Object.keys(env),source+
  ';return {pmLatestClientPayments,pmUpdateLastPayment};')(...Object.values(env));
 return {db,root,pmLatestClientPayments,pmUpdateLastPayment};
}

test('último pago: usa fecha real y separa solares de igual número por etapa',()=>{
 const {pmLatestClientPayments}=mock();
 const result=pmLatestClientPayments('c1','R1');
 assert.equal(result.latest.date,'2026-10-12');
 assert.equal(result.bySolar.length,2);
 assert.ok(result.bySolar.some(r=>r.label==='Etapa 1 · Bloque B · Solar 12'&&r.date==='2026-09-10'));
 assert.ok(result.bySolar.some(r=>r.label==='Etapa 2 · Bloque B · Solar 12'&&r.date==='2026-10-12'));
});

test('no mezcla otros clientes, residenciales, recibos anulados ni históricos sin confirmar',()=>{
 const {pmLatestClientPayments}=mock();
 assert.equal(pmLatestClientPayments('c1','R1').latest.date,'2026-10-12');
 assert.equal(pmLatestClientPayments('c2','R1').latest,null);
 assert.equal(pmLatestClientPayments('c1','R2').latest,null);
 assert.equal(pmLatestClientPayments('sin-cliente','R1').latest,null);
});

test('incluye abonos de propietario, incluso pago conjunto de varios solares',()=>{
 const {db,pmLatestClientPayments}=mock();
 db.ownerPayments.push({id:'OP1',clientId:'c1',residenceId:'R1',date:'2026-11-20',amountCents:600000,
  allocations:[{references:[{lotId:'a'},{lotId:'b'}]}]});
 const result=pmLatestClientPayments('c1','R1');
 assert.equal(result.latest.date,'2026-11-20');
 assert.deepEqual(result.bySolar.map(r=>r.date),['2026-11-20','2026-11-20']);
 db.ownerPayments[0].deletedAt='2026-11-21';
 assert.equal(pmLatestClientPayments('c1','R1').latest.date,'2026-10-12');
});

test('ventana muestra última fecha al abrir cliente y actualiza al cambiarlo',()=>{
 const {root,pmUpdateLastPayment}=mock();
 pmUpdateLastPayment('c1','R1');
 assert.equal(root.children[0].children[1].textContent,'2026-10-12');
 assert.equal(root.children[1].cls,'pm-last-payment-solares');
 pmUpdateLastPayment('sin-cliente','R1');
 assert.equal(root.children[0].children[1].textContent,'Sin pagos registrados');
 assert.equal(root.children.length,1);
 pmUpdateLastPayment('','R1');
 assert.equal(root.children[0].children[1].textContent,'Selecciona un cliente');
});

test('conecta ficha y ventas al panel sin alterar abonos ni calendario',()=>{
 assert.match(build,/payment-last-date-ui\.js/);
 assert.match(modal,/pmUpdateLastPayment\(client\?\.id\|\|'',residence\(\)\.id\)/);
 assert.match(modal,/pmUpdateLastPayment\(client\?\.id\|\|'',ownerPaymentDraft\?\.residenceId\)/);
 assert.equal((modal.match(/last\.id='pm-last-payment'/g)||[]).length,2);
 assert.match(style,/\.pm-last-payment-main/);
 assert.match(style,/@media\(max-width:650px\)/);
 assert.match(style,/body\.lotigest-dark[^\n]+\.pm-last-payment/);
});

test('último recibo conjunto suma solo los solares del cliente y conserva el correlativo original',()=>{
 const {db,pmLatestClientPayments,pmUpdateLastPayment,root}=mock();
 db.payments.unshift(
 {id:'g1',groupId:'G',saleId:'s1',date:'2026-11-05',amount:20000,receiptReference:'003556',recordedAt:'2026-11-05T20:00:00Z'},
 {id:'g2',groupId:'G',saleId:'s2',date:'2026-11-05',amount:30000,receiptReference:'003556',recordedAt:'2026-11-05T20:00:00Z'},
 {id:'old',saleId:'s1',date:'2026-11-05',amount:5000,receiptReference:'3555',recordedAt:'2026-11-05T19:00:00Z'},
 {id:'cancel',saleId:'s1',date:'2026-11-06',amount:1000,status:'cancelled'});
 const {latest,bySolar}=pmLatestClientPayments('c1','R1');
 assert.equal(latest.amountCents,5000000);assert.equal(latest.reference,'003556');
 assert.deepEqual(bySolar.map(x=>x.amountCents),[2000000,3000000]);
 pmUpdateLastPayment('c1','R1');
 const details=root.children[0].children[2];
 assert.equal(details.children[0].textContent,'L 50,000.00');
 assert.equal(details.children[1].textContent,'Correlativo: 003556');
});
test('abono conjunto de ficha sin desglose no duplica el monto por solar',()=>{
 const {db,pmLatestClientPayments}=mock();
 db.ownerPayments.push({id:'OP',clientId:'c1',residenceId:'R1',date:'2026-11-20',amountCents:600000,receiptReference:'0009',
 allocations:[{amountCents:600000,references:[{lotId:'a'},{lotId:'b'}]}]});
 const result=pmLatestClientPayments('c1','R1');
 assert.equal(result.latest.amountCents,600000);
 assert.ok(result.bySolar.every(x=>x.amountCents===null));
});

test('mayor correlativo no se oculta cuando tiene fecha anterior',()=>{
 const {db,pmLatestClientPayments}=mock();
 db.payments.push({id:'F1',saleId:'s1',date:'2026-11-03',amount:6500,receiptReference:'4421'},
 {id:'F2',saleId:'s1',date:'2025-11-25',amount:6500,receiptReference:'4422'});
 const result=pmLatestClientPayments('c1','R1');
 assert.equal(result.latest.reference,'4421');
 assert.equal(result.highest.reference,'4422');
 assert.equal(result.highest.date,'2025-11-25');
});
test('adelantos vigentes excluyen meses pasados y muestran la próxima cuota parcial',()=>{
 const src=readFileSync(new URL('../deploy/cloudflare/payment-history-ui.js',import.meta.url),'utf8');
 const fn=new Function(src.slice(src.indexOf('function pmFutureCoverage('),src.indexOf('function pmReportPaymentStatus('))+';return pmFutureCoverage;')();
 const rows=[{dueDate:'2026-11-27',dueCents:650000,appliedCents:650000,remainingCents:0},
 {dueDate:'2026-12-27',dueCents:650000,appliedCents:650000,remainingCents:0},
 {dueDate:'2027-01-27',dueCents:650000,appliedCents:100000,remainingCents:550000}];
 const v=fn(rows,'2026-11-25');
 assert.equal(v.covered,1);assert.equal(v.amountCents,750000);assert.equal(v.partial,1);assert.equal(v.next.remainingCents,550000);
});
