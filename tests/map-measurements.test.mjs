import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyOfficialMapMeasurements} from '../map-measurements.mjs';
import {OFFICIAL_MAP_MEASUREMENTS as data} from '../official-map-measurements-data.mjs';
test('416 solares con cotas verificables y sin inventar medidas pendientes',()=>{
 assert.equal(Object.keys(data.lots).length,416);
 for(const row of Object.values(data.lots)){
  assert.ok(row.edges.some(e=>e.value>0));
  for(const e of row.edges){
   if(e.origin==='pending'){assert.equal(e.value,null);continue;}
   assert.ok(Number.isFinite(e.value)&&e.value>0);
   if(e.origin==='pdf')assert.equal(e.bbox.length,4);
   else{
    const other=data.lots[e.sourceFeatureKey].edges[e.sourceEdge-1];
    assert.equal(other.origin,'pdf');assert.equal(e.value,other.value);
    const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
    const direct=Math.max(distance(e.points[0],other.points[0]),distance(e.points[1],other.points[1]));
    const reverse=Math.max(distance(e.points[0],other.points[1]),distance(e.points[1],other.points[0]));
    assert.ok(Math.min(direct,reverse)<.13,'debe ser el mismo lindero completo');
   }
  }
 }
});
test('cotas comerciales literales del plano, sin aplicar 50.4 m a un lindero parcial de C5',()=>{
 const vals=n=>data.lots['commercial-stage2-0'+n].edges.map(e=>e.value);
 assert.ok(vals(1).includes(27.95));assert.ok(vals(1).includes(48.25));
 assert.deepEqual(vals(2),[48.04,20,48.25,20]);
 assert.deepEqual(vals(4),[50.4,20,49.72,20.02]);
 assert.ok(vals(5).includes(40.74));assert.ok(vals(5).includes(28.41));assert.ok(vals(5).includes(null));
});
test('carga y recarga idempotentes conservan área, medidas manuales, precios y registros financieros',()=>{
 const state={residences:[{id:'arrayan',builtin:'arrayan'}],lots:[{id:'keep',residenceId:'arrayan',sourceFeatureKey:'ar-001',price:1234,area:245,dimensions:{front:15,depth:21},ownerClientId:'C',status:'sold',geo:[[1,1],[2,2],[3,3]]},{id:'other',residenceId:'otro',sourceFeatureKey:'ar-001',sourceMeasures:[999]}],clients:[{id:'C'}],sales:[{id:'S',lotId:'keep'}],payments:[{id:'P',saleId:'S',amount:10}]};
 const before=structuredClone(state);assert.equal(applyOfficialMapMeasurements(state),true);
 assert.ok(state.lots[0].sourceMeasures.length);assert.equal(state.lots[0].area,245);assert.equal(state.lots[0].price,1234);assert.deepEqual(state.lots[0].dimensions,before.lots[0].dimensions);assert.deepEqual(state.lots[0].geo,before.lots[0].geo);assert.deepEqual(state.lots[1],before.lots[1]);
 for(const k of ['clients','sales','payments'])assert.deepEqual(state[k],before[k]);
 assert.equal(applyOfficialMapMeasurements(state),false);assert.equal(applyOfficialMapMeasurements(null),false);
});
test('otro plano importado con claves reutilizadas no recibe las medidas de Arrayán',()=>{
 const state={residences:[{id:'arrayan',builtin:null,officialPlan:{sha256:'different'}}],lots:[{id:'keep',residenceId:'arrayan',sourceFeatureKey:'ar-001'}]};
 const before=structuredClone(state);assert.equal(applyOfficialMapMeasurements(state),false);assert.deepEqual(state,before);
});

test('lectura del servidor y catálogo del vendedor reciben las mismas cotas sin datos personales',async()=>{
 const {correctConfirmedBlocks}=await import('../functions/api/app/block-corrections.js');
 const {sellerCatalog}=await import('../functions/api/app/catalog.js');
 const state={version:3,company:{name:'Prueba'},residences:[{id:'arrayan',builtin:'arrayan'}],lots:[{id:'LOT',residenceId:'arrayan',sourceFeatureKey:'ar-001',ownerClientId:'SECRET',price:123}],clients:[{id:'SECRET',name:'Privado'}],sales:[],payments:[]};
 const result=correctConfirmedBlocks(state);assert.ok(result.lots[0].sourceMeasurementEdges.length);
 const seller=sellerCatalog(result);assert.deepEqual(seller.lots[0].sourceMeasures,result.lots[0].sourceMeasures);assert.equal(seller.lots[0].ownerClientId,undefined);assert.deepEqual(seller.clients,[]);
});
