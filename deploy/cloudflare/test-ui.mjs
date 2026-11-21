import {onRequest as accountUsers} from '../../functions/api/app/users.js';
import {IDBFactory} from 'fake-indexeddb';
import {JSDOM} from 'jsdom';
import vm from 'node:vm';
import {webcrypto,pbkdf2Sync,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fixture} from './test-d1.mjs';
import {onRequest as session} from '../../functions/api/app/session.js';
import {onRequest as state} from '../../functions/api/app/state.js';
import {onRequest as password} from '../../functions/api/app/password.js';
import {onRequest as file} from '../../functions/api/app/file.js';
import {onRequest as users} from '../../functions/api/d1/users.js';
const root=new URL('../../',import.meta.url);
export async function setup(){
 const f=await fixture(),salt='b'.repeat(64),pass='Prueba-local-segura-2026';
 const credential=pbkdf2Sync(pass,salt,600000,32,'sha256').toString('hex');f.db.db.prepare('UPDATE users SET token_hash=?').run(createHash('sha256').update(credential).digest('hex'));
 const server={...f,pass,cookie:'',offline:false,errors:[],writes:0,indexedDB:new IDBFactory()};
 server.read=async()=>{const r=await state({env:f.env,request:new Request('https://lotigest.test/api/app/state',{headers:{Cookie:server.cookie}})});return r.json();};
 server.write=async(data)=>state({env:f.env,request:new Request('https://lotigest.test/api/app/state',{method:'PUT',headers:{Cookie:server.cookie,Origin:'https://lotigest.test','Content-Type':'application/json'},body:JSON.stringify(data)})});return server;
}
export function boot(server,cache,storage={},transformSource=html=>html){
 const html=transformSource(readFileSync(new URL('cloudflare-pages/index.html',root),'utf8'));const dom=new JSDOM(html,{url:'https://lotigest.test/',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window,d=w.document;w.indexedDB=server.indexedDB;
 Object.defineProperty(w,'crypto',{value:webcrypto});w.AbortController=AbortController;w.Blob=Blob;w.DecompressionStream=DecompressionStream;w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.matchMedia=()=>({matches:false,addEventListener(){},addListener(){}});w.confirm=()=>false;w.alert=()=>{};w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.URL.createObjectURL=()=>'';w.ResizeObserver=class {observe(){}disconnect(){}};w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({measureText:()=>({width:50})},{get:(o,k)=>o[k]??(()=>{})});
 for(const [key,value] of Object.entries(storage))w.localStorage.setItem(key,value);
 if(cache)w.localStorage.setItem('lotigest_d1_pending_v1',cache);
 w.addEventListener('error',e=>server.errors.push(e.error?.message||e.message));
 w.fetch=async(path,options={})=>{if(server.offline)throw Error('SIN RED');const url=new URL(path,w.location.origin),key=url.pathname==='/api/app/users'?'accountUsers':url.pathname.startsWith('/api/app/')?url.pathname.split('/').at(-1):url.pathname==='/api/d1/users'?'users':null;if(!key)return new Response(JSON.stringify(url.pathname==='/api/client-sales/requests'?{requests:[]}:{ }));if(key==='state'&&options.method==='PUT')server.writes++;const response=await ({session,state,password,users,file,accountUsers})[key]({env:server.env,request:new Request(url,{...options,headers:{...options.headers,Cookie:server.cookie,Origin:w.location.origin}})});if(response.headers.get('Set-Cookie'))server.cookie=response.headers.get('Set-Cookie').split(';')[0];return response;};
 new vm.Script(readFileSync(new URL('cloudflare-pages/qr-generator.js',root),'utf8')).runInContext(dom.getInternalVMContext());new vm.Script(readFileSync(new URL('cloudflare-pages/acceso-nube.js',root),'utf8')).runInContext(dom.getInternalVMContext());new vm.Script(readFileSync(new URL('cloudflare-pages/offline-files.js',root),'utf8')).runInContext(dom.getInternalVMContext());for(const path of ['lotigestLedger.js','lotigestCadastre.js','lotigestOwnerPayments.js'])new vm.Script(readFileSync(new URL('cloudflare-pages/'+path,root),'utf8')).runInContext(dom.getInternalVMContext());
 for(const script of d.querySelectorAll('script'))if(script.textContent.trim()&&!script.type.includes('json'))new vm.Script(script.textContent).runInContext(dom.getInternalVMContext());
 const app={dom,w,d,click(selector){const el=d.querySelector(selector);if(!el)throw Error('No existe: '+selector);el.click();},change(selector,value){const el=d.querySelector(selector);if(!el)throw Error('No existe: '+selector);el.value=value;el.dispatchEvent(new w.Event('change',{bubbles:true}));},input(selector,value){const el=d.querySelector(selector);if(!el)throw Error('No existe: '+selector);el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));},submit(selector,data={}){const form=d.querySelector(selector);if(!form)throw Error('No existe formulario: '+selector);for(const [name,value] of Object.entries(data)){const field=form.elements.namedItem(name);if(!field)throw Error('No existe campo: '+name);field.value=value;}form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));},close(){dom.window.close();},cache(){return w.localStorage.getItem('lotigest_d1_pending_v1');}};return app;
}
export async function until(fn,label='condición',ms=12000){for(let i=0;i<ms/50;i++){if(await fn())return;await new Promise(r=>setTimeout(r,50));}throw Error('No se completó: '+label);}
export async function saved(app){await new Promise(r=>setTimeout(r,450));await until(()=>app.d.querySelector('#lotigest-cloud-status')?.textContent.includes('Guardado en Cloudflare D1'),'guardado en nube');}
export async function login(app,server){await until(()=>app.d.querySelector('#login-form'),'inicio');app.submit('#login-form',{user:'admin',password:server.pass});await saved(app);}
