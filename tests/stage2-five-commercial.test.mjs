import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const html=readFileSync(new URL('../prueba-diseno-v08.html',import.meta.url),'utf8');
const extract=name=>JSON.parse(html.match(new RegExp('const '+name+'=(\\[[\\s\\S]*?\\]);'))[1]);
const existing=extract('arrayanFeatures'),five=extract('arrayanStage2CommercialFive'),road=extract('arrayanStage2CommercialStreetPoints');
const filter=f=>/^commercial-stage2-0[1-5]$/.test(String(f?.key||''));
const src=html.slice(html.indexOf('function mapFeatures(r){'),html.indexOf("let arrayanStageFilter="));
const getMap=db=>new Function('arrayanFeatures','recoveredStageFeatures','isArrayanStage2CommercialFive','arrayanStage2CommercialFive','officialFeatureStages','confirmedStageOneBlocks','db',src+'return mapFeatures;')(existing,extract('recoveredStageFeatures'),filter,five,{},{},db);
test('cinco locales aprobados: originales intactos y sin duplicar trazados guardados',()=>{
 assert.equal(existing.length,411);
 assert.equal(createHash('sha256').update(JSON.stringify(existing)).digest('hex'),'36dcb3af93716cf2e203e527feb25a3a4c3ceb9116bea55749a93b6497b482fb');
 const fs=getMap({lots:[]})({id:'arrayan',builtin:'arrayan',features:[{...five[0],points:[[1,1],[2,2],[3,3]]}],records:{}});
 assert.equal(fs.length,416);assert.equal(new Set(fs.map(f=>f.key)).size,416);
 assert.deepEqual(fs.filter(filter),five);assert.deepEqual(five.map(f=>f.displayLabel),['C-1','C-2','C-3','C-4','C-5']);
});
test('C4 comparte lindero con cabecera existente y calle desemboca entre dos bloques',()=>{
 const head=existing.find(f=>f.key==='ar-274');
 assert.deepEqual(five[3].points[1],head.points[1]);assert.deepEqual(five[3].points[2],head.points[3]);
 assert.deepEqual(road[1],existing.find(f=>f.key==='ar-286').points[0]);
 assert.deepEqual(road[4],head.points[1]);
 assert.match(html,/arrayanRoadMarkup\+arrayanStage2CommercialStreetSvg/);
});
const syncSource=html.slice(html.indexOf('function syncMapInventory(r,force=false,onlyNew=null){'),html.indexOf('function inventoryArea('));
const getSync=db=>new Function('db','mapFeatures','arrayanStage2CommercialFive','getLot','importedLotId',syncSource+'return syncMapInventory;')(db,getMap(db),five,id=>db.lots.find(l=>l.id===id),(r,f)=>'NEW-'+f.key);
test('reconciliar sólo cinco locales sin tocar los otros registros ni cobros',()=>{
 const db={lots:existing.map(f=>({id:f.key,residenceId:'arrayan',sourceFeatureKey:f.key,status:'sold',price:123,ownerClientId:'C'})),sales:[{id:'S',lotId:'ar-001'}],payments:[{id:'P',saleId:'S'}],clients:[{id:'C'}]};
 const before=structuredClone(db);const r={id:'arrayan',builtin:'arrayan',records:{},inventoryMapVersion:2,inventoryImportSummary:{sourceCount:411}};
 const sync=getSync(db);assert.equal(sync(r),true);assert.equal(db.lots.length,416);assert.deepEqual(db.lots.slice(0,411),before.lots);assert.deepEqual(db.sales,before.sales);assert.deepEqual(db.payments,before.payments);assert.equal(r.inventoryImportSummary.sourceCount,416);assert.equal(sync(r),false);
});
test('recuperar figura privada sin perder dueño, precio, área, contratos ni pagos',()=>{
 const db={lots:five.map((f,i)=>({id:f.key,residenceId:'arrayan',sourceFeatureKey:f.key,status:i===0?'sold':'private',ownerClientId:i===0?'C':null,price:99,area:647,sourceMapPoints:[[0,0]]})),sales:[{id:'S',lotId:five[0].key}],payments:[{id:'P',saleId:'S'}]};
 const r={id:'arrayan',builtin:'arrayan',records:{},inventoryMapVersion:2,inventoryImportSummary:{sourceCount:411}};
 const sync=getSync(db);assert.equal(sync(r),true);assert.equal(db.lots.length,5);assert.equal(db.lots[0].status,'sold');assert.equal(db.lots[0].ownerClientId,'C');assert.equal(db.lots[1].status,'available');assert.equal(db.lots[0].area,647);assert.equal(db.lots[0].price,99);assert.deepEqual(db.payments,[{id:'P',saleId:'S'}]);assert.equal(sync(r),false);
});

test('interfaz real muestra cinco figuras, 2D/3D y filtros sin errores de JavaScript',async()=>{
 const {setup,boot,until}=await import('../deploy/cloudflare/test-ui.mjs');
 const server=await setup(),app=boot(server);
 try{
  await until(()=>app.d.querySelector('#login-form'));
  app.submit('#login-form',{user:'admin',password:server.pass});
  await until(()=>app.d.querySelector('[data-page=arrayan]'));
  app.click('[data-page=arrayan]');
  assert.equal(app.d.querySelectorAll('.ar-solar').length,416);
  for(const f of five){const el=app.d.querySelector('[data-id="'+f.key+'"]');assert.ok(el);assert.match(el.textContent,new RegExp(f.displayLabel));}
  assert.ok(app.d.querySelector('[data-stage2-commercial-road]'));
  app.change('#ar-stage-filter','2');assert.equal(app.d.querySelectorAll('.ar-solar').length,274);
  app.change('#ar-stage-filter','1');assert.equal(app.d.querySelectorAll('.ar-solar').length,142);
  assert.deepEqual(server.errors,[]);
 }finally{app.close();}
});
