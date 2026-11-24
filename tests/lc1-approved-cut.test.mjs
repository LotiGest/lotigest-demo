import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyOfficialMapMeasurements} from '../map-measurements.mjs';
import {OFFICIAL_MAP_MEASUREMENTS as data} from '../official-map-measurements-data.mjs';
const approved=[[279.6,351.96],[272.693,354.461],[280.08,368.4],[305.76,354.72],[308.04,347.04],[307.08,346.44],[304.2,342.72]];
test('LC-1 reproduce exactamente el corte aprobado, sin los vértices de la prolongación',()=>{
 const html=readFileSync(new URL('../prueba-diseno-v08.html',import.meta.url),'utf8');
 const fs=JSON.parse(html.match(/const arrayanFeatures=(\[.*?\]);/)[1]);
 assert.deepEqual(fs.find(f=>f.key==='commercial-01').points,approved);
 assert.deepEqual(data.lots['commercial-01'].mapPoints,approved);
 assert.equal(fs.length,411);
 assert.equal(fs.find(f=>f.key==='commercial-01').points.some(p=>p[0]===309.72),false);
});
test('actualización del inventario corrige solo el trazado de LC-1, preserva datos y GPS manual',()=>{
 const state={residences:[{id:'arrayan',builtin:'arrayan'}],lots:[{id:'LC1',residenceId:'arrayan',sourceFeatureKey:'commercial-01',sourceMapPoints:[[0,0]],status:'sold',ownerClientId:'C',price:99999,area:500,dimensions:{front:19},geo:[[1,1],[2,2],[3,3]]},{id:'OTHER',residenceId:'arrayan',sourceFeatureKey:'ar-001',sourceMapPoints:[[4,4]]}],clients:[{id:'C'}],sales:[{id:'S',lotId:'LC1'}],payments:[{id:'P',saleId:'S',amount:10}]};
 applyOfficialMapMeasurements(state);
 const protectedBefore=structuredClone(state);state.lots[0].sourceMapPoints=[[0,0]];
 assert.equal(applyOfficialMapMeasurements(state),true);
 assert.deepEqual(state,protectedBefore);
 assert.deepEqual(state.lots[1].sourceMapPoints,[[4,4]]);
 assert.deepEqual(state.lots[0].sourceMapPoints,approved);
 assert.equal(applyOfficialMapMeasurements(state),false);
});
