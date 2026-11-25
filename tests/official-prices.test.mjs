import test from 'node:test';
import assert from 'node:assert/strict';
import {officialPriceCatalog,quoteAtZeroInterest,prepareOfficialPriceFill,prepareLotPriceWorkbook,officialStage2Workbook} from '../official-prices.mjs';

const residence={id:'ALTOS',name:'Altos del Arrayán'};
const lot=(id,block,number,extras={})=>({id,residenceId:'ALTOS',stage:2,block,sourceNumber:String(number),type:'solar',status:'available',area:null,price:null,...extras});
const state=(lots,reservations=[])=>({residences:[residence],lots,clients:[],sales:[],reservations,ownershipStatements:[]});

test('PDF: 264 referencias de etapa 2, no duplica solar por bloque',()=>{
 const rows=officialPriceCatalog();
 assert.equal(rows.length,264);
 assert.equal(new Set(rows.map(r=>r.stage+'/'+r.block+'/'+r.number)).size,264);
 assert.equal(Math.round(rows.reduce((sum,r)=>sum+r.total,0)*100)/100,149557455.24);
 assert.equal(rows.filter(r=>r.block==='L').length,12);
 assert.equal(rows.filter(r=>r.block==='O').length,8);
 assert.equal(rows.filter(r=>r.block==='N').length,13);
});
test('0 % interés, más prima disminuye la cuota',()=>{
 assert.equal(quoteAtZeroInterest(507993.64,50799.36,84),5442.79);
 assert.equal(quoteAtZeroInterest(507993.64,100000,84),4857.07);
 assert.throws(()=>quoteAtZeroInterest(500000,500001,84),/Revisa/);
 assert.throws(()=>quoteAtZeroInterest(500000,50000,0),/Revisa/);
});
test('completa solo campos faltantes del solar disponible y no altera estado original',()=>{
 const data=state([lot('B2','B',2),lot('B3','B',3,{status:'sold'}),lot('B4','B',4,{price:400000}),lot('B5','B',5)]);
 data.reservations.push({lotId:'B5',status:'active'});
 const original=JSON.stringify(data),result=prepareOfficialPriceFill(data,'ALTOS');
 assert.equal(JSON.stringify(data),original);
 assert.equal(result.changes.length,1);
 const updated=result.state.lots.find(l=>l.id==='B2');
 assert.equal(updated.price,507993.64);
 assert.equal(updated.priceVara2,2300);
 assert.equal(updated.areaVaras2,220.87);
 assert.equal(updated.quotePrima,50799.36);
 assert.equal(updated.quoteMonths,84);
 assert.equal(result.state.lots.find(l=>l.id==='B3').status,'sold');
 assert.equal(result.state.lots.find(l=>l.id==='B4').price,400000);
 assert.equal(result.state.lots.find(l=>l.id==='B5').price,null);
});
test('etapas repetidas no se mezclan y no crea solares nuevos',()=>{
 const original=state([lot('stage1B2','B',2,{stage:1})]);
 const p=prepareOfficialPriceFill(original,'ALTOS');
 assert.equal(p.changes.length,0);
 assert.equal(p.state.lots.length,1);
 assert.equal(p.state.lots[0].price,null);
});
test('otra residencial no recibe precios',()=>{
 assert.throws(()=>prepareOfficialPriceFill({residences:[{id:'EXTRA',name:'Otra residencial'}],lots:[],sales:[]},'EXTRA'),/únicamente/);
});
test('importación catálogo etapa 2: no modifica etapa 1, ventas ni pagos',()=>{
 const data=state([lot('B2','B',2),lot('B2-1','B',2,{stage:1}),lot('B3','B',3,{status:'sold',price:100000,ownerClientId:'C'}),lot('N2','N',2),lot('Ñ2','Ñ',2)]);
 data.sales=[{id:'S',lotId:'B3',price:100000}];data.payments=[{id:'P',saleId:'S',amount:100}];
 const p=prepareLotPriceWorkbook(officialStage2Workbook(),data,'ALTOS',true);
 assert.equal(p.errors.length,0);assert.equal(p.state.lots[0].price,507993.64);assert.equal(p.state.lots[1].price,null);assert.equal(p.state.lots[2].price,100000);assert.equal(p.state.lots[2].pdfPrecioTotal,507993.64);assert.equal(p.state.lots[3].price,544278.90);assert.equal(p.state.lots[4].price,544278.90);assert.deepEqual(p.state.sales,data.sales);assert.deepEqual(p.state.payments,data.payments);
 const unconfirmed=prepareLotPriceWorkbook(officialStage2Workbook(),data,'ALTOS');assert.equal(unconfirmed.review.length,32);
});
