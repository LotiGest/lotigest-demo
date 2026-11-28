import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./ledger-ui.js',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('const officialPlanImages='),source.indexOf('const sellerPages='));
test('only the requested plan loads; concurrent calls reuse its offline resource',async()=>{
 const reads=[],requests=[],updates=[];
 const image={getAttribute:()=>'/api/app/file?key=one',setAttribute:(k,v)=>updates.push(v)};
 const api=new Function('window','navigator','fetch','document','URL','URLSearchParams',helpers+';return {officialBackground,officialPlanLoads};')(
  {lotigestFiles:{get:async key=>{reads.push(key);return key==='one'?{}:null;}}},{onLine:false},async url=>{requests.push(url);throw Error('offline');},{querySelectorAll:()=>[image]},{createObjectURL:()=> 'blob:one'},URLSearchParams);
 assert.deepEqual(reads,[]);
 const residence={id:'r1',officialPlan:{backgroundKey:'one'}};
 assert.equal(api.officialBackground(residence),'/api/app/file?key=one');
 api.officialBackground(residence);
 await api.officialPlanLoads.get('one');
 assert.deepEqual(reads,['one']);assert.deepEqual(requests,[]);assert.deepEqual(updates,['blob:one']);
 assert.equal(api.officialBackground(residence),'blob:one');
 assert.equal(api.officialBackground({...residence,officialPlan:{backgroundKey:'two'}}),'/api/app/file?key=two');
 await api.officialPlanLoads.get('two');assert.deepEqual(reads,['one','two']);
});
