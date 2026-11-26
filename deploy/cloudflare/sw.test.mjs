import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('el service worker descarga la aplicación, sirve el inicio sin red y no almacena respuestas de la API',async()=>{
 const events={},stores=new Map();let offline=false,active=false,release='1';
 const key=req=>new URL(typeof req==='string'?req:req.url,'https://lotigest.test').href;
 const caches={async open(name){if(!stores.has(name))stores.set(name,new Map());const store=stores.get(name);return {async addAll(paths){for(const path of paths){const result=await fetcher(path);store.set(key(path),result);}},async match(req){return store.get(key(req))?.clone();},async put(req,response){store.set(key(req),response);},async keys(){return [...store.keys()].map(url=>({url}));},async delete(req){return store.delete(key(req));}};},async keys(){return [...stores.keys()];},async delete(name){return stores.delete(name);}};
 const fetcher=async req=>{if(offline)throw Error('offline');const pathname=new URL(typeof req==='string'?req:req.url,'https://lotigest.test').pathname;return new Response(pathname==='/'?'<main>LOTIGEST shell</main>':pathname==='/version.json'?JSON.stringify({version:release}):'resource');};
 const self={location:{origin:'https://lotigest.test'},addEventListener(name,fn){events[name]=fn;},clients:{async claim(){active=true;}},skipWaiting(){}};
 vm.runInNewContext(readFileSync(new URL('./service-worker.js',import.meta.url),'utf8'),{self,caches,fetch:fetcher,URL,Response,AbortController,setTimeout,clearTimeout});
 let install;events.install({waitUntil(p){install=p;}});await install;let activation;events.activate({waitUntil(p){activation=p;}});await activation;assert.ok(active);
 const shellBeforeMap=await caches.open('lotigest-shell-__LOTIGEST_VERSION__');assert.equal(await shellBeforeMap.match('/altos-arrayan-vista-proyecto.webp'),undefined);
 let result;events.fetch({request:{url:'https://lotigest.test/altos-arrayan-vista-proyecto.webp',method:'GET'},respondWith(p){result=p;}});assert.equal(await (await result).text(),'resource');
 const resourceCache=await caches.open('lotigest-resources-v1');assert.ok(await resourceCache.match('/altos-arrayan-vista-proyecto.webp'));
 offline=true;result=null;events.fetch({request:{url:'https://lotigest.test/altos-arrayan-vista-proyecto.webp',method:'GET'},respondWith(p){result=p;}});assert.equal(await (await result).text(),'resource');
 result=null;events.fetch({request:{url:'https://lotigest.test/',method:'GET',mode:'navigate'},respondWith(p){result=p;}});assert.ok((await (await result).text()).includes('LOTIGEST shell'));
 result=null;events.fetch({request:{url:'https://lotigest.test/api/app/state',method:'GET'},respondWith(p){result=p;}});assert.equal(result,null);
 offline=false;release='2';events.fetch({request:{url:'https://lotigest.test/version.json?check=1',method:'GET'},respondWith(p){result=p;}});assert.equal((await (await result).json()).version,'2');offline=true;events.fetch({request:{url:'https://lotigest.test/version.json?check=2',method:'GET'},respondWith(p){result=p;}});assert.equal((await (await result).json()).version,'2');
 // Un enlace recibido por WhatsApp nunca puede mostrar el inicio de sesión como página de respaldo.
 result=null;events.fetch({request:{url:'https://lotigest.test/seleccionar-solar.html?map=abcdefabcdefabcdefabcdef',method:'GET',mode:'navigate'},respondWith(p){result=p;}});
 assert.equal(await (await result).text(),'resource');
 const publicShell=await caches.open('lotigest-shell-__LOTIGEST_VERSION__');
 await publicShell.delete('/seleccionar-solar.html');
 result=null;events.fetch({request:{url:'https://lotigest.test/seleccionar-solar.html?map=abcdefabcdefabcdefabcdef',method:'GET',mode:'navigate'},respondWith(p){result=p;}});
 const noFallback=await result;assert.equal(noFallback.status,503);assert.ok(!(await noFallback.text()).includes('LOTIGEST shell'));
 const shell=await caches.open('lotigest-shell-__LOTIGEST_VERSION__');assert.ok(await shell.match('/offline-files.js'));assert.equal(await shell.match('/api/app/state'),undefined);
});
