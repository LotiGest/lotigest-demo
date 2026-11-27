import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,boot,login} from './test-ui.mjs';

test('desktop dock and sidebar keep navigating through repeated panel changes without writes or stale payment covers',async()=>{
 const server=await setup(),app=boot(server);
 try{
  await login(app,server);const initial=await server.read(),writes=server.writes;
  for(let round=0;round<4;round++)for(const page of ['contracts','payments','dashboard','arrayan','clients','collections','dashboard']){
   const dock=app.d.querySelector('.cp-dock [data-page="'+page+'"]');
   (dock||app.d.querySelector('.lg-nav [data-page="'+page+'"]')).click();
   await new Promise(resolve=>setTimeout(resolve,0));
   assert.equal(app.d.querySelector('.lg-nav .active')?.dataset.page,page);
   if(page!=='payments')assert.equal(app.d.querySelector('#modal-root .lg-payment-modern'),null);
   assert.equal(app.d.querySelectorAll('.cp-dock').length,1);
  }
  assert.equal(server.writes,writes);assert.deepEqual(server.errors,[]);
  assert.deepEqual((await server.read()).state.payments,initial.state.payments);
 }finally{app.close();}
});
