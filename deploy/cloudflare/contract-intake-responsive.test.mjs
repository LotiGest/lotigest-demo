import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ui=readFileSync(new URL('./contract-intake-ui.js',import.meta.url),'utf8');
const css=readFileSync(new URL('./contract-intake-modern.css',import.meta.url),'utf8');
const build=readFileSync(new URL('./build.mjs',import.meta.url),'utf8');
const source=ui.slice(ui.indexOf('function contractIntakeManualCash('),ui.indexOf('function contractIntakeFields(){'));

function view(stage,block,lotId){
 const lots=[
  {id:'E1A1',residenceId:'R',stage:1,block:'A',sourceNumber:'1',price:200000,area:180},
  {id:'E1B1',residenceId:'R',stage:1,block:'B',sourceNumber:'1',price:210000,area:170},
  {id:'E2A1',residenceId:'R',stage:2,block:'A',sourceNumber:'1',price:240000,area:190}
 ];
 const client={id:'C',name:'CLIENTE DE PRUEBA',identity:'0801 1990 00021'};
 const env={contractIntakeWorking:{mode:'manual',preferredClientId:'C',values:{stage,block,lotId,down:50000,months:60},extraLots:[]},
  db:{clients:[client],lots,sales:[],contractTexts:[]},residence:()=>({id:'R'}),residenceLots:()=>lots,
  getClient:id=>id==='C'?client:null,getLot:id=>lots.find(l=>l.id===id),
  activeReservation:()=>false,document:{addEventListener(){}},esc:x=>String(x??'')};
 return new Function(...Object.keys(env),source+';return contractIntakeManualFields();')(...Object.values(env));
}

test('Nuevo contrato separa los cuatro pasos del diseño aprobado',()=>{
 const html=view('1','A','E1A1');
 for(const name of ['Buscar cliente','Asignar solar','Condiciones del contrato','Fecha del contrato'])
  assert.ok(html.includes(name),name);
 assert.match(html,/class="lg-contract-form"/);
 assert.match(html,/id="contract-intake-stage"/);
 assert.match(html,/id="contract-intake-block"/);
 assert.match(html,/id="contract-intake-lot"/);
 assert.match(html,/name="solarPrice_0"/);
 assert.match(html,/id="contract-auto-financed"/);
 assert.match(html,/id="contract-auto-monthly"/);
 assert.doesNotMatch(html,/Bloque leído|Solar leído|name="north"|name="south"|name="east"|name="west"/);
});

test('Etapa y bloque evitan confundir solares con el mismo número',()=>{
 const first=view('1','A','E1A1');
 assert.match(first,/value="E1A1" selected/);
 assert.doesNotMatch(first,/value="E1B1"/);
 assert.doesNotMatch(first,/value="E2A1"/);
 const second=view('2','A','E2A1');
 assert.match(second,/value="E2A1" selected/);
 assert.doesNotMatch(second,/value="E1A1"/);
});

test('La ventana se hace amplia en PC y apila elementos en celular sin desbordarse',()=>{
 assert.match(css,/width:min\(1440px,calc\(100vw - 32px\)\)/);
 assert.match(css,/@media\(max-width:900px\)/);
 assert.match(css,/lg-contract-client-layout\{grid-template-columns:minmax\(0,1fr\)\}/);
 assert.match(css,/lg-contract-lot-fields\{grid-template-columns:minmax\(0,1fr\)\}/);
 assert.match(css,/lg-contract-date-fields\{grid-template-columns:minmax\(0,1fr\)\}/);
 assert.match(css,/max-height:calc\(100dvh - 12px\)/);
 assert.match(css,/modal-footer\{padding:10px 12px;display:grid/);
 assert.match(build,/files\['contract-intake-modern.css'\]/);
 assert.match(build,/href="\/contract-intake-modern.css"/);
});

test('Presionar Enter busca al cliente sin enviar accidentalmente el contrato',()=>{
 const handlers={};
 const button={click(){button.clicked=true;},focus(){}};
 const results={innerHTML:''};
 const env={contractIntakeWorking:{mode:'manual',values:{},extraLots:[]},
  db:{clients:[{id:'C',name:'CLIENTE DE PRUEBA',identity:'0801 1990 00021'}]},
  document:{addEventListener:(event,fn)=>{(handlers[event]??=[]).push(fn);},
   getElementById:id=>id==='contract-intake-client-results'?results:null,
   querySelectorAll:()=>[button]},esc:x=>String(x??'')};
 new Function(...Object.keys(env),source+';return true')(...Object.values(env));
 const key=handlers.keydown.find(fn=>fn.toString().includes("contract-intake-client-search"));
 let prevented=false;
 key({key:'Enter',target:{id:'contract-intake-client-search',value:'0801'},preventDefault(){prevented=true;},stopImmediatePropagation(){}});
 assert.equal(prevented,true);
 assert.equal(button.clicked,true);
 assert.match(results.innerHTML,/CLIENTE DE PRUEBA/);
});


test('Panel de referencia incorpora Consultar, Limpiar y la marca sin perder datos del solar',()=>{
 const html=view('1','A','E1A1');
 assert.match(html,/data-contract-intake-consult>Consultar/);
 assert.match(html,/Datos del solar · Terrenos y Predios/);
 assert.match(html,/Precio base del solar/);
 assert.match(ui,/data-contract-intake-clear>Limpiar/);
 assert.match(ui,/contractIntakeWorking\.values\.date=contractIntakeLocalToday\(\)/);
 assert.match(ui,/lg-contract-brand/);
 assert.match(css,/Panel Nuevo Contrato · referencia aprobada/);
 assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\) minmax\(110px,auto\)/);
 assert.match(css,/body\.lotigest-dark #modal-root \.lg-contract-modern/);
});

test('Limpiar reinicia solo el borrador sin alterar clientes ni solares',()=>{
 const callbacks={};
 const draft={mode:'manual',busy:false,preferredClientId:'C',clientQuery:'CLIENTE',extraLots:[{lotId:'L2'}],
  values:{date:'2024-01-01',name:'CLIENTE DE PRUEBA',down:50000,lotId:'L1'}};
 const db={clients:[{id:'C'}],lots:[{id:'L1'}]};
 const review={innerHTML:'anterior'};
 const mockDocument={addEventListener:(name,fn)=>(callbacks[name]??=[]).push(fn),
  getElementById:id=>id==='contract-intake-review'?review:null};
 const env={contractIntakeWorking:draft,document:mockDocument,db,
  contractIntakeFields:()=>'<form id="contract-intake-form">Limpio</form>',
  contractIntakeLocalToday:()=> '2026-11-20',esc:x=>String(x??'')};
 new Function(...Object.keys(env),source+';return true')(...Object.values(env));
 const clear=callbacks.click.find(fn=>fn.toString().includes("data-contract-intake-clear"));
 assert.ok(clear,'Debe registrar el botón Limpiar');
 let prevented=false;
 clear({target:{closest:selector=>selector==='[data-contract-intake-clear]'?{}:null},
  preventDefault(){prevented=true},stopImmediatePropagation(){}});
 assert.equal(prevented,true);
 assert.equal(draft.preferredClientId,'');
 assert.deepEqual(draft.extraLots,[]);
 assert.deepEqual(draft.values,{date:'2026-11-20'});
 assert.match(review.innerHTML,/Limpio/);
 assert.equal(db.clients.length,1);
 assert.equal(db.lots.length,1);
});


test('Nuevo contrato permite editar precio desde tarjeta sin quitar el solar',()=>{
 const html=view('1','A','E1A1');
 assert.match(html,/data-contract-intake-edit-price="0"/);
 assert.match(html,/data-contract-intake-remove-primary/);
 assert.match(html,/name="solarPrice_0"[^>]*value="200,000"/);
 assert.match(html,/name="down"[^>]*value="50,000"/);
 assert.match(html,/data-contract-money="true"/);
 assert.match(ui,/target\.scrollIntoView/);
 assert.match(css,/input\[data-contract-money\]/);
});

test('Los separadores de miles no cambian los valores de los contratos',()=>{
 const start=ui.indexOf('function contractIntakeMoneyDisplay(');
 const end=ui.indexOf('function contractIntakeManualFields()',start);
 const functions=new Function(ui.slice(start,end)+';return {display:contractIntakeMoneyDisplay,parse:contractIntakeMoneyNumber};')();
 assert.equal(functions.display('1000000'),'1,000,000');
 assert.equal(functions.display('1000000.50'),'1,000,000.50');
 assert.equal(functions.display('25000.00'),'25,000.00');
 assert.equal(functions.parse('1,000,000.50'),1000000.5);
 assert.equal(functions.parse('25,000.00'),25000);
 assert.ok(Number.isNaN(functions.parse('')));
});
