import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('./app-bridge.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('function cloudMergeIndependent('),source.indexOf('function cloudDownload('));
const merge=new Function(code+';return cloudMergeIndependent;')();
const blank=()=>({version:3,company:{name:'PRUEBA'},clients:[],lots:[],sales:[],payments:[],residences:[{id:'R',records:{}}]});
function change(base,n){
 const s=structuredClone(base),id=String(n);
 s.clients.push({id:'C'+id,name:'CLIENTE '+id});
 s.lots.push({id:'L'+id,ownerClientId:'C'+id});
 s.sales.push({id:'S'+id,lotId:'L'+id,clientId:'C'+id});
 s.payments.push({id:'P'+id,saleId:'S'+id,receiptReference:String(4407+n)});
 s.residences[0].records['F'+id]={lotId:'L'+id,status:'sold'};
 return s;
}
test('tres equipos editan clientes, solares, contratos y recibos distintos sin perder registros',()=>{
 const base=blank(),a=change(base,1),b=change(base,2),c=change(base,3);
 const merged=merge(base,c,merge(base,b,a));
 for(const key of ['clients','lots','sales','payments'])assert.equal(merged[key].length,3);
 assert.equal(Object.keys(merged.residences[0].records).length,3);
 assert.deepEqual(base,blank());
});
test('rechaza escrituras concurrentes sobre el mismo cliente o crédito y folio duplicado',()=>{
 const base=change(change(blank(),1),2);
 const a=structuredClone(base),b=structuredClone(base);
 a.clients[0].name='A';b.clients[0].name='B';
 assert.throws(()=>merge(base,a,b),{status:409});
 const x=structuredClone(base),y=structuredClone(base);
 x.payments.push({id:'PA',saleId:'S1',receiptReference:'5555'});
 y.payments.push({id:'PB',saleId:'S1',receiptReference:'5556'});
 assert.throws(()=>merge(base,x,y),{status:409});
 y.payments.at(-1).saleId='S2';y.payments.at(-1).receiptReference='0005555';
 assert.throws(()=>merge(base,x,y),{status:409});
});
test('reintenta conflicto de revisión con nueva mutación y conserva base pendiente en caché',async()=>{
 const base=blank(),a=change(base,1),b=change(base,2);
 const cache=new Map(),put=[];let server=a,revision=2,mutations=0;
 const ctx={cloudReady:true,cloudBusy:false,cloudBlocked:false,cloudOffline:false,cloudUser:{role:'admin'},
  cloudQueue:{owner:'admin',revision:1,confirmed:JSON.stringify(base),latest:JSON.stringify(b),pending:null},db:b,
  navigator:{onLine:true},CLOUD_CACHE:'cache',localStorage:{setItem:(k,v)=>cache.set(k,v),getItem:k=>cache.get(k)},
  cloudFlushFiles:async()=>{},cloudStatus:()=>{},activeModal:null,render:()=>{},crypto:{randomUUID:()=>String(++mutations)},
  cloudCredential:null,readStoredLotigest:JSON.parse,
  cloudApi:async(path,options)=>{
   if(!options)return {state:server,revision};
   const data=JSON.parse(options.body);put.push(data);
   if(data.revision!==revision)throw Object.assign(Error('conflicto'),{status:409});
   server=data.state;return {revision:++revision};
  }
 };
 vm.createContext(ctx);vm.runInContext(code,ctx);
 vm.runInContext('cloudPersist()',ctx);
 assert.equal(vm.runInContext("cloudUnpack(localStorage.getItem(CLOUD_CACHE)).confirmed",ctx),JSON.stringify(base));
 await vm.runInContext('cloudFlush()',ctx);
 assert.equal(put.length,2);assert.notEqual(put[0].mutation,put[1].mutation);
 assert.equal(ctx.cloudBlocked,false);assert.equal(ctx.cloudQueue.pending,null);
 assert.equal(ctx.cloudQueue.confirmed,ctx.cloudQueue.latest);
 assert.equal(server.clients.length,2);assert.equal(ctx.db.payments.length,2);
});
test('copia antigua sin base confirmada no se fusiona a ciegas',()=>{
 const ctx={};vm.createContext(ctx);vm.runInContext(code,ctx);
 ctx.raw=JSON.stringify({cacheVersion:2,confirmed:false,latest:'datos',pending:{raw:null}});
 const saved=vm.runInContext('cloudUnpack(raw)',ctx);
 assert.equal(saved.confirmed,null);assert.equal(saved.pending.raw,'datos');
});
