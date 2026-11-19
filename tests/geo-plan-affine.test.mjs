import test from 'node:test';
import assert from 'node:assert/strict';
import {planAffineFromAnchors,planPointToGps,planAffineFeatures} from '../geo-plan-affine.mjs';
const pairs=[{plan:[0,0],gps:[14.1,-89.1]},{plan:[100,0],gps:[14.1,-89.099]},{plan:[0,100],gps:[14.099,-89.1]}];
test('transformación afín mantiene los tres puntos y conserva orden',()=>{
 const t=planAffineFromAnchors(pairs);
 for(const p of pairs)for(let i=0;i<2;i++)assert.ok(Math.abs(planPointToGps(t,p.plan)[i]-p.gps[i])<1e-9);
 assert.deepEqual(planPointToGps(t,[50,50]).map(n=>+n.toFixed(5)),[14.0995,-89.0995]);
});
test('polígonos derivados preservan registro y no lo mutan',()=>{
 const source=[{key:'stage1-a-1',points:[[0,0],[20,0],[20,20],[0,20]]}];
 const snapshot=JSON.stringify(source);
 const result=planAffineFeatures(source,pairs);
 assert.equal(result[0].feature.key,'stage1-a-1');assert.equal(result[0].geo.length,4);
 assert.equal(JSON.stringify(source),snapshot);
});
test('rechaza 3 puntos colineales del croquis',()=>{
 assert.throws(()=>planAffineFromAnchors([{plan:[0,0],gps:[14,-89]},{plan:[10,10],gps:[14.001,-89]},{plan:[20,20],gps:[14,-89.001]}]),/triángulo/);
});
test('rechaza 3 puntos colineales en satélite',()=>{
 assert.throws(()=>planAffineFromAnchors([{plan:[0,0],gps:[14,-89]},{plan:[10,0],gps:[14,-89.001]},{plan:[0,10],gps:[14,-89.002]}]),/satélite/);
});
test('rechaza calibración con escala excesiva',()=>{
 const bad=[{plan:[0,0],gps:[14.1,-89.1]},{plan:[100,0],gps:[14.1,-89.0]},{plan:[0,100],gps:[14.0,-89.1]}];
 assert.throws(()=>planAffineFeatures([{points:[[0,0],[100,0],[100,100],[0,100]]}],bad),/escala/);
});
