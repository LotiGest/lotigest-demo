import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./service-worker.js',import.meta.url),'utf8');
function runtime({stores=new Map(),version='39',failImage=false}={}){
 const events={},calls=[];let body='release-'+version,remoteVersion=version,blocked=false,skipped=false;
 const key=r=>new URL(typeof r==='string'?r:r.url,'https://lotigest.test').href;
 const caches={async open(name){if(!stores.has(name))stores.set(name,new Map());const store=stores.get(name);return {async addAll(paths){await Promise.all(paths.map(async path=>{store.set(key(path),await fetcher(path));}));},async match(path){return store.get(key(path))?.clone();},async put(path,response){store.set(key(path),response);},async keys(){return [...store.keys()].map(url=>({url}));},async delete(path){return store.delete(key(path));}};},async keys(){return [...stores.keys()];},async delete(name){return stores.delete(name);}};
 const fetcher=async request=>{const url=new URL(key(request));calls.push(url.pathname);if(failImage&&url.pathname.endsWith('.webp'))throw Error('optional image unavailable');if(blocked&&url.pathname==='/')return new Promise(()=>{});return new Response(url.pathname==='/version.json'?JSON.stringify({version:remoteVersion}):url.pathname==='/'?body:'asset');};
 const self={location:{origin:'https://lotigest.test'},addEventListener:(name,fn)=>events[name]=fn,clients:{claim:async()=>{}},skipWaiting(){skipped=true;}};
 vm.runInNewContext(source.replace('__LOTIGEST_VERSION__',version),{self,caches,fetch:fetcher,URL,Response,AbortController,setTimeout,clearTimeout});
 return {stores,caches,calls,events,get skipped(){return skipped;},block(){blocked=true;},setRemote(v){body='release-'+v;remoteVersion=v;},async install(){let pending;events.install({waitUntil:p=>pending=p});await pending;},async activate(){let pending;events.activate({waitUntil:p=>pending=p});await pending;},fetch(path,mode='navigate',method='GET'){let result;events.fetch({request:{url:key(path),method,mode},respondWith:p=>result=p});return result;}};
}
test('cached app opens without making a navigation request, including a stalled connection',async()=>{
 const r=runtime();await r.install();r.calls.length=0;r.block();
 assert.equal(await (await r.fetch('/')).text(),'release-39');assert.equal(await (await r.fetch('/index.html')).text(),'release-39');assert.deepEqual(r.calls,[]);
});
test('version checks stay fresh, manual repair goes to the network and JSON navigation never poisons the app cache',async()=>{
 const r=runtime();await r.install();r.calls.length=0;r.setRemote('40');
 assert.equal((await (await r.fetch('/version.json?check=1','cors')).json()).version,'40');
 assert.equal((await (await r.fetch('/version.json')).json()).version,'40');
 assert.equal(await (await r.fetch('/')).text(),'release-39','new release waits for manual activation');
 assert.equal(await (await r.fetch('/?manual=1&lotigestVersion=40')).text(),'release-40');
 assert.equal(r.calls.filter(p=>p==='/').length,1,'only the manual navigation fetches the app');
});
test('new release stays separate, optional image failure does not block installation, API requests are never intercepted',async()=>{
 const old=runtime({version:'38'});await old.install();
 const next=runtime({stores:old.stores,version:'39',failImage:true});await next.install();
 assert.equal(await (await old.fetch('/')).text(),'release-38');assert.equal(next.skipped,false);
 next.events.message({data:{type:'ACTIVATE_UPDATE'}});assert.equal(next.skipped,true);await next.activate();
 assert.equal(await (await next.fetch('/')).text(),'release-39');assert.equal(next.stores.has('lotigest-shell-38'),false);
 assert.equal(next.fetch('/api/app/state','cors'),undefined);assert.equal(next.fetch('/api/app/state','cors','PUT'),undefined);
});
