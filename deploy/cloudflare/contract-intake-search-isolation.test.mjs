import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const modern=readFileSync(new URL('./contract-intake-ui.js',import.meta.url),'utf8');
const legacy=readFileSync(new URL('../../prueba-diseno-v08.html',import.meta.url),'utf8');
const source=modern.slice(modern.indexOf('function contractIntakeManualCash('),modern.indexOf('function contractIntakeFields(){'));

function setup(clients=[
 {id:'C1',name:'CRISTIAN BESSLER ACEVEDO MOLINA',identity:'0801199000021',phone:'+50499999999',address:'OCOTEPEQUE',rtn:'08011990000211',occupation:'AGRICULTOR'},
]){
 const handlers={click:[],input:[],keydown:[]},draft={mode:'manual',preferredClientId:'',
  clientQuery:'',values:{date:'2026-11-20',name:'PERSONA ANTERIOR',identity:'9999999999999'},extraLots:[]};
 const box={innerHTML:''},search={value:''},review={innerHTML:''};
 let autoClicks=0,legacySearches=0,scanOpens=0;
 const db={clients,sales:[],contractTexts:[],lots:[],reservations:[]};
 function createChoice(c){
  const button={dataset:{contractClientPick:c.id},focused:false,
   focus(){this.focused=true;},click(){
    autoClicks++;
    const event={target:{closest:selector=>
     selector==='[data-contract-client-pick],[data-contract-client-clear]'?button:
     selector==='[data-action]'?null:null},
     preventDefault(){},stopImmediatePropagation(){}};
    for(const listener of handlers.click)listener(event);
   }};
  return button;
 }
 const document={
  addEventListener:(type,fn)=>{(handlers[type]??=[]).push(fn);},
  getElementById:id=>({
   'contract-intake-client-search':search,'contract-intake-client-results':box,
   'contract-intake-review':review
  }[id]||null),
  querySelectorAll:selector=>{
   if(selector!=='#contract-intake-client-results [data-contract-client-pick]')return [];
   const ids=[...box.innerHTML.matchAll(/data-contract-client-pick="([^"]+)"/g)].map(m=>m[1]);
   return ids.map(id=>createChoice(clients.find(c=>c.id===id)));
  }
 };
 // Emular el código histórico: solo escucha su propio campo de búsqueda.
 handlers.input.push(event=>{
  if(event.target.id==='contract-client-search')legacySearches++;
 });
 handlers.click.push(event=>{
  if(event.target.closest?.('[data-action="contract-scan"]'))scanOpens++;
 });
 const env={contractIntakeWorking:draft,db,document,
  getClient:id=>clients.find(c=>c.id===id),getLot:id=>db.lots.find(l=>l.id===id),
  residenceLots:()=>db.lots,activeReservation:()=>null,
  residence:()=>({id:'R'}),esc:v=>String(v??''),contractIntakeFields:()=>draft.values.name};
 const {contractIntakeManualFields}=new Function(...Object.keys(env),source+
  ';return {contractIntakeManualFields};')(...Object.values(env));
 return {
  draft,box,search,review,document,contractIntakeManualFields,handlers,
  emitInput(query){
   search.value=query;
   const event={target:{id:'contract-intake-client-search',value:query,closest:()=>null}};
   for(const fn of handlers.input)fn(event);
  },
  clickSearch(){
   const btn={dataset:{},closest:sel=>sel==='[data-contract-client-search]'?btn:null};
   const event={target:btn,preventDefault(){},stopImmediatePropagation(){}};
   for(const fn of handlers.click)fn(event);
  },
  metrics:()=>({autoClicks,legacySearches,scanOpens})
 };
}

test('Nuevo Contrato utiliza IDs independientes del buscador que abre Escanear contrato',()=>{
 assert.match(legacy,/function chooseContractScanClient\(\)/);
 assert.match(legacy,/if\(e\.target\.id==='contract-client-search'\)renderContractClientResults\(\)/);
 const x=setup(),html=x.contractIntakeManualFields();
 assert.match(html,/id="contract-intake-client-search"/);
 assert.match(html,/id="contract-intake-client-results"/);
 assert.doesNotMatch(html,/id="contract-client-search"/);
 assert.doesNotMatch(html,/id="contract-client-results"/);
 assert.doesNotMatch(html,/data-action="contract-scan"/);
});

test('Buscar un único cliente completa datos aquí mismo, sin abrir Escanear contrato',()=>{
 const x=setup();
 x.emitInput('CRISTIAN BESSLER');
 x.clickSearch();
 assert.equal(x.draft.preferredClientId,'C1');
 assert.equal(x.draft.values.name,'CRISTIAN BESSLER ACEVEDO MOLINA');
 assert.equal(x.draft.values.identity,'0801199000021');
 assert.equal(x.draft.values.phone,'+50499999999');
 assert.equal(x.draft.values.address,'OCOTEPEQUE');
 assert.equal(x.draft.values.rtn,'08011990000211');
 assert.equal(x.review.innerHTML,'CRISTIAN BESSLER ACEVEDO MOLINA');
 assert.deepEqual(x.metrics(),{autoClicks:1,legacySearches:0,scanOpens:0});
 assert.doesNotMatch(x.box.innerHTML,/data-action="contract-scan"/);
});

test('Con varias coincidencias deja elegir y no abre el escáner',()=>{
 const x=setup([
  {id:'C1',name:'CRISTIAN BESSLER ACEVEDO MOLINA',identity:'0801199000021',address:'OCOTEPEQUE'},
  {id:'C2',name:'CRISTIAN ANTONIO MOLINA',identity:'0801199000022',address:'SAN MARCOS'}
 ]);
 x.emitInput('CRISTIAN');x.clickSearch();
 assert.equal(x.draft.preferredClientId,'');
 assert.equal(x.metrics().scanOpens,0);
 assert.equal(x.metrics().autoClicks,0);
 const results=x.document.querySelectorAll('#contract-intake-client-results [data-contract-client-pick]');
 assert.equal(results.length,2);
 results[1].click();
 assert.equal(x.draft.preferredClientId,'C2');
 assert.equal(x.draft.values.name,'CRISTIAN ANTONIO MOLINA');
 assert.equal(x.draft.values.address,'SAN MARCOS');
 assert.equal(x.metrics().scanOpens,0);
});

test('Buscar por identidad y Enter mantiene la ventana Nuevo contrato',()=>{
 const x=setup();
 x.search.value='0801199000021';
 let prevented=false;
 const event={key:'Enter',target:{id:'contract-intake-client-search',value:x.search.value},
  preventDefault(){prevented=true;},stopImmediatePropagation(){}};
 for(const handler of x.handlers.keydown)handler(event);
 assert.equal(prevented,true);
 assert.equal(x.draft.preferredClientId,'C1');
 assert.equal(x.metrics().scanOpens,0);
});
