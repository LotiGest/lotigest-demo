const VERSION='__LOTIGEST_VERSION__';
const SHELL='lotigest-shell-'+VERSION;
const RESOURCES='lotigest-resources-v1';
const CORE=['/','/acceso-nube.js','/payment-fields.mjs','/version.json','/manifest.webmanifest','/offline-files.js','/lotigestLedger.js','/lotigestCadastre.js','/lotigestOwnerPayments.js','/app-icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(SHELL).then(cache=>cache.addAll(CORE))));
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE_UPDATE')self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith('lotigest-shell-')&&name!==SHELL)await caches.delete(name);await self.clients.claim();await Promise.allSettled(['https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js','https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css','https://cdn.jsdelivr.net/npm/leaflet-draw@1.0.4/dist/leaflet.draw.js','https://cdn.jsdelivr.net/npm/leaflet-draw@1.0.4/dist/leaflet.draw.css'].map(async url=>{const response=await network(url,5000);if(response.ok)await (await caches.open(RESOURCES)).put(url,response);}));})()));
async function network(request,ms=5000){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),ms);try{return await fetch(request,{signal:controller.signal});}finally{clearTimeout(timer);}}
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||(url.origin===self.location.origin&&url.pathname.startsWith('/api/')))return;
 if(request.mode==='navigate'&&url.origin===self.location.origin){event.respondWith((async()=>{try{const r=await network(request);if(r.ok){const cache=await caches.open(SHELL);await cache.put('/',r.clone());return r;}throw Error('unavailable');}catch{return (await caches.open(SHELL)).match('/')||Response.error();}})());return;}
 if(url.origin===self.location.origin&&url.pathname==='/version.json'){event.respondWith((async()=>{const cache=await caches.open(SHELL);try{const response=await network(request);if(!response.ok)throw Error('unavailable');await cache.put('/version.json',response.clone());return response;}catch{return await cache.match('/version.json')||Response.error();}})());return;}
 if(url.origin===self.location.origin&&CORE.includes(url.pathname)){event.respondWith((async()=>{const cached=await (await caches.open(SHELL)).match(url.pathname);return cached||fetch(request);})());return;}
 const external=['cdn.jsdelivr.net','tessdata.projectnaptha.com','fonts.googleapis.com','fonts.gstatic.com','tile.openstreetmap.org','server.arcgisonline.com'].includes(url.hostname);
 if(!external)return;
 event.respondWith((async()=>{const cache=await caches.open(RESOURCES),cached=await cache.match(request);if(cached)return cached;const response=await fetch(request);if(response.ok||response.type==='opaque'){await cache.put(request,response.clone());const keys=await cache.keys();while(keys.length>100)await cache.delete(keys.shift());}return response;})());
});
