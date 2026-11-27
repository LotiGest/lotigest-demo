import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../deploy/cloudflare/control-panels-ui.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf(' let renderSchedules=null;'),source.indexOf(' const lookupRender=render;'));
const original=readFileSync(new URL('../prueba-diseno-v08.html',import.meta.url),'utf8').split('\n').find(s=>s.startsWith('function arrayanRecord(f)'));
test('600 map lots reuse one schedule per render with exactly the original debt colors, then reflect changed payments',()=>{
 const db={sales:[],lots:[]},records={},features=[],rows=[];let calls=0;
 for(let i=0;i<600;i++){
  const lot={id:'L'+i,residenceId:'R',status:i%7===0?'reserved':i%11===0?'private':'sold',mapDebtFlag:i%3===0};db.lots.push(lot);records['F'+i]={lotId:lot.id};features.push({key:'F'+i,initial:'available'});
  if(i<200){db.sales.push({lotId:lot.id});for(let j=0;j<84;j++)rows.push({lot,remaining:j===0&&i%2?100:0,status:j===0?'late':'paid',dueDate:'2026-01-01'});}
 }
 features.push({key:'missing',initial:'available'});
 const api=new Function('db','residenceRecords','residence','getLot','dateKey','schedule',original+'\n'+code+'\nreturn {record:f=>arrayanRecord(f),run(fn){renderSchedules=new Map();try{return fn();}finally{renderSchedules=null;}}};')(
 db,()=>records,()=>({id:'R'}),id=>db.lots.find(l=>l.id===id),()=> '2026-11-27',()=>{calls++;return rows;});
 const expected=features.map(api.record);assert.equal(calls,200);calls=0;
 api.run(()=>{for(let i=0;i<3;i++)assert.deepEqual(features.map(api.record),expected);});assert.equal(calls,1);
 rows.forEach(row=>row.remaining=0);calls=0;
 const updated=api.run(()=>features.map(api.record));assert.equal(calls,1);assert.equal(updated[1].status,'sold');assert.equal(updated[1].rs.length,0);
 assert.equal(api.record(features[1]).status,'sold');assert.equal(calls,2);
});
