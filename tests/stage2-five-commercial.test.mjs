import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../prueba-diseno-v08.html',import.meta.url),'utf8');
const gps=readFileSync(new URL('../deploy/cloudflare/gps-plan-alignment-ui.js',import.meta.url),'utf8');
const extract=(name)=>{
 const pattern=new RegExp('const '+name+'=(\\[[\\s\\S]*?\\]);');
 const match=html.match(pattern);
 assert.ok(match,'Falta '+name);
 return JSON.parse(match[1]);
};
const existing=extract('arrayanFeatures');
const five=extract('arrayanStage2CommercialFive');

test('se conservan los 411 polígonos previos, incluidas las 11 parcelas comerciales de etapa 1',()=>{
 assert.equal(existing.length,411);
 assert.equal(existing.filter(f=>f.type==='commercial'&&f.stage===1).length,11);
 assert.equal(existing.filter(f=>f.type==='commercial'&&f.stage===2).length,0);
 assert.equal(five.length,5);
 assert.deepEqual(five.map(f=>f.key),['commercial-stage2-01','commercial-stage2-02','commercial-stage2-03','commercial-stage2-04','commercial-stage2-05']);
 assert.deepEqual(five.map(f=>f.pdfAreaM2),[647,962,970,998,969]);
 assert.ok(five.every(f=>f.stage===2&&f.type==='commercial'&&f.initial==='private'&&f.sourcePrivate===true));
 assert.ok(five.every(f=>f.points.length>=4&&f.points.every(p=>p.length===2&&p.every(Number.isFinite))));
});
test('conservar las calles, la franja de 8 metros y la alineación GPS previa',()=>{
 const mapFn=html.slice(html.indexOf('function mapFeatures(r){'),html.indexOf('let arrayanStageFilter=',html.indexOf('function mapFeatures(r){')));
 assert.match(mapFn,/\.\.\.arrayanFeatures,\.\.\.arrayanStage2CommercialFive/);
 assert.match(html,/const arrayanRoadMarkup=/);
 assert.match(html,/function residenceRoadMarkup\(\)/);
 assert.match(html,/M 155 220 Q 180 225 200 260 T 260 360 T 340 515/);
 // El hueco de acceso aparece entre los contornos del local 3 y el 4.
 const a=five[2].points,b=five[3].points;
 assert.ok(!a.some(p=>b.some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<0.005)));
 assert.match(gps,/features\.length-added/);
 assert.match(gps,/isArrayanStage2CommercialFive/);
});
test('actualizar un inventario ya sincronizado agrega solo cinco y conserva todos los datos anteriores',()=>{
 const start=html.indexOf('function syncMapInventory(r,force=false,onlyNew=null){');
 const stop=html.indexOf('function inventoryArea(',start);
 assert.ok(start>=0&&stop>start);
 const method=html.slice(start,stop);
 const previous={id:'AR-BB-09',residenceId:'arrayan',block:'B',stage:1,
  sourceNumber:'9',price:650000,ownerClientId:'C3',status:'sold',area:220};
 const r={id:'arrayan',builtin:'arrayan',roads:[[[2,3],[9,11]]],
  records:{old:{lotId:previous.id,block:previous.block}},inventoryMapVersion:2,
  inventoryImportSummary:{sourceCount:415,added:0,matched:415}};
 const db={lots:[structuredClone(previous)]};
 const originals=JSON.stringify({lot:db.lots[0],roads:r.roads,records:r.records.old});
 const oldFeatures=Array.from({length:415},(_,i)=>({key:'OLD'+i}));
 const features=[...oldFeatures,...five];
 const fn=new Function('db','mapFeatures','getLot','importedLotId','arrayanStage2CommercialFive','isArrayanStage2CommercialFive',
  method+'return syncMapInventory;')(
   db,()=>features,id=>db.lots.find(l=>l.id===id),(res,f)=>'AR-E2-LC-'+String(f.number).padStart(2,'0'),
   five,f=>/^commercial-stage2-0[1-5]$/.test(f?.key||''));
 assert.equal(fn(r),true);
 assert.equal(db.lots.length,6);
 assert.equal(JSON.stringify({lot:db.lots[0],roads:r.roads,records:r.records.old}),originals);
 assert.deepEqual(db.lots.slice(1).map(l=>l.area),[647,962,970,998,969]);
 assert.ok(db.lots.slice(1).every(l=>l.type==='commercial'&&l.status==='private'&&l.price===null&&!l.ownerClientId));
 assert.equal(r.inventoryImportSummary.sourceCount,420);
 assert.equal(fn(r),false,'la segunda sincronización no debe duplicar solares');
 assert.equal(db.lots.length,6);
});
