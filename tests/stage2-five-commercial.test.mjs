import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../prueba-diseno-v08.html',import.meta.url),'utf8');
const gps=readFileSync(new URL('../deploy/cloudflare/gps-plan-alignment-ui.js',import.meta.url),'utf8');
const threeD=readFileSync(new URL('../deploy/cloudflare/solar-3d-map-ui.js',import.meta.url),'utf8');
const extract=name=>{
 const start=html.indexOf('const '+name+'=');
 assert.ok(start>=0,'no existe '+name);
 const match=html.slice(start+('const '+name+'=').length).match(/^(\[[\s\S]*?\]);/);
 assert.ok(match,'no se pudo leer '+name);
 return JSON.parse(match[1]);
};
const existing=extract('arrayanFeatures');
const recovered=extract('recoveredStageFeatures');

test('se retiran solo los cinco trazos grises añadidos; 411 solares originales permanecen',()=>{
 assert.equal(existing.length,411);
 assert.equal(existing.filter(f=>f.type==='commercial'&&f.stage===1).length,11);
 assert.equal(existing.filter(f=>f.type==='commercial'&&f.stage===2).length,0);
 assert.equal(recovered.length,4);
 assert.doesNotMatch(html,/const arrayanStage2CommercialFive=/);
 assert.doesNotMatch(html,/data-stage2-commercial-road/);
 assert.doesNotMatch(html,/arrayanStage2CommercialStreetSvg/);
 assert.match(html,/const arrayanRoadMarkup=/);
 assert.match(html,/function residenceRoadMarkup\(\)/);
 assert.match(html,/M 155 220 Q 180 225 200 260 T 260 360 T 340 515/);
});

test('tanto la vista 2D como la 3D no dibujan las cinco figuras eliminadas',()=>{
 const start=html.indexOf('function mapFeatures(r){');
 const end=html.indexOf('let arrayanStageFilter=',start);
 const source=html.slice(start,end);
 const filter=f=>/^commercial-stage2-0[1-5]$/.test(String(f?.key||''));
 const mapFeatures=new Function('arrayanFeatures','recoveredStageFeatures',
  'removedStage2CommercialFeature','officialFeatureStages','confirmedStageOneBlocks','db',
  source+'return mapFeatures;')(existing,recovered,filter,{}, {},{lots:[]});
 const sample={id:'arrayan',builtin:'arrayan',records:{},
   features:Array.from({length:5},(_,i)=>({key:'commercial-stage2-0'+(i+1),
    number:i+1,stage:2,points:[[1,2],[3,4],[5,6]]}))};
 const results=mapFeatures(sample);
 assert.equal(results.length,415);
 assert.equal(results.filter(filter).length,0);
 assert.equal(results.filter(f=>f.type==='commercial'&&f.stage===1).length,11);
 assert.match(html,/function residenceFeatures\(\)\{return mapFeatures\(residence\(\)\)/);
 assert.match(threeD,/svg\.querySelectorAll\('\.ar-solar'\)/);
 assert.doesNotMatch(gps,/arrayanStage2CommercialStreetPoints/);
 assert.match(gps,/mapFeatures\(r\)\.length/);
});

test('la sincronización corrige la cuenta sin borrar inventario ni datos de clientes',()=>{
 const oldLot={id:'AR-LC-E2-01',residenceId:'arrayan',sourceFeatureKey:'commercial-stage2-01',
  ownerClientId:'CLIENTE',status:'private',price:null,area:647,
  sourceMapPoints:[[1,2],[3,4],[5,6]]};
 const realLot={id:'AR-BA-01',residenceId:'arrayan',sourceFeatureKey:'ar-001',
  ownerClientId:'OTRO',price:324120,status:'sold',area:240};
 const db={lots:[structuredClone(oldLot),structuredClone(realLot)],
  sales:[{id:'V1',lotId:'AR-BA-01'}],payments:[{id:'P1',saleId:'V1',amount:1000}],
  clients:[{id:'CLIENTE'},{id:'OTRO'}]};
 const residence={id:'arrayan',builtin:'arrayan',
  records:{'commercial-stage2-01':{lotId:oldLot.id}},
  roads:[[[2,3],[4,5]]],inventoryMapVersion:2,
  inventoryImportSummary:{sourceCount:420,added:5,matched:415}};
 const before=JSON.stringify({db,roads:residence.roads,records:residence.records});
 const begin=html.indexOf('function syncMapInventory(r,force=false,onlyNew=null){');
 const finish=html.indexOf('function inventoryArea(',begin);
 const source=html.slice(begin,finish);
 const fn=new Function('db','mapFeatures','removedStage2CommercialFeature',
   source+'return syncMapInventory;')(db,()=>Array.from({length:415},(_,i)=>({key:'old-'+i})),
    f=>/^commercial-stage2-0[1-5]$/.test(String(f?.key||'')));
 assert.equal(fn(residence),true);
 assert.equal(residence.inventoryImportSummary.sourceCount,415);
 assert.equal(residence.inventoryImportSummary.correctedStage2Overlay,true);
 assert.equal(JSON.stringify({db,roads:residence.roads,records:residence.records}),before);
 assert.equal(fn(residence),false);
});
