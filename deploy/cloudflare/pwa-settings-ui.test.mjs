import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,boot,login,saved,until} from './test-ui.mjs';

test('settings installation/fluid controls preserve unsaved form data and do not post business changes',async()=>{
 const server=await setup(),app=boot(server);
 try{
  await login(app,server);app.click('[data-page=settings]');const before=await server.read(),writes=server.writes;
  app.input('#company-form [name=name]','CAMBIO FICTICIO SIN GUARDAR');
  assert.ok(app.d.querySelector('[data-lg-install-app]'));app.click('[data-lg-fluid-toggle]');
  assert.equal(app.d.documentElement.classList.contains('lg-fluid-mode'),false);assert.equal(app.d.querySelector('#company-form [name=name]').value,'CAMBIO FICTICIO SIN GUARDAR');
  assert.equal(server.writes,writes);assert.equal(JSON.stringify((await server.read()).state),JSON.stringify(before.state));assert.deepEqual(server.errors,[]);
 }finally{app.close();}
});
test('hidden tabs skip refresh polling but still save financial changes, then refresh on return',async()=>{
 const server=await setup(),app=boot(server,undefined,{},html=>html.replace('async function cloudRefresh(){','window.__qaRefresh=cloudRefresh;async function cloudRefresh(){'));
 try{
  await login(app,server);let checks=0;const fetch=app.w.fetch;app.w.fetch=(path,...rest)=>{if(String(path).includes('state?revision'))checks++;return fetch(path,...rest);};
  Object.defineProperty(app.d,'visibilityState',{configurable:true,value:'hidden'});await app.w.__qaRefresh();assert.equal(checks,0);
  app.click('[data-page=finance]');app.click('[data-action=finance-expense]');
  app.submit('#finance-entry-form',{amount:'100',description:'GASTO FICTICIO EN SEGUNDO PLANO'});await saved(app);
  assert.ok((await server.read()).state.cashEntries.some(e=>e.amount===100&&e.description==='GASTO FICTICIO EN SEGUNDO PLANO'));
  Object.defineProperty(app.d,'visibilityState',{configurable:true,value:'visible'});app.d.dispatchEvent(new app.w.Event('visibilitychange'));await until(()=>checks>0,'refresh on return');
  assert.deepEqual(server.errors,[]);
 }finally{app.close();}
});
