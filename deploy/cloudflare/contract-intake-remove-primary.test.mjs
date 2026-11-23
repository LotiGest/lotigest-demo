import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./contract-intake-ui.js',import.meta.url),'utf8');
const start=source.indexOf('function contractIntakeRemovePrimaryDraft(');
const end=source.indexOf("document.addEventListener('click'",start);
assert.ok(start>=0&&end>start,'Existe el manejador seguro de quitar solar');
const removePrimary=new Function(source.slice(start,end)+'; return contractIntakeRemovePrimaryDraft;')();
const lots=[
 {id:'L1',stage:1,block:'J',sourceNumber:1,price:573680},
 {id:'L2',stage:2,block:'C',sourceNumber:3,price:300000},
 {id:'L3',stage:2,block:'C',sourceNumber:4,price:350000}
];
const getLot=id=>lots.find(l=>l.id===id);
const primary={lotId:'L1',stage:'1',block:'J',number:'1',solarPrice_0:'570000',solarDown_0:'20000',down:'20000',months:'84',date:'2026-11-23'};
test('papelera roja aparece junto a Precio base del solar y no altera inventario',()=>{
 assert.match(source,/lg-contract-price-heading/);
 assert.match(source,/data-contract-intake-remove-primary/);
 assert.match(source,/aria-label="Quitar este solar del contrato en preparación"/);
 assert.match(source,/viewBox="0 0 24 24"/);
 const before=JSON.stringify(lots);
 const draft={mode:'manual',values:{...primary},extraLots:[],selectedLotId:'L1'};
 assert.equal(removePrimary(draft,getLot),null);
 assert.equal(draft.values.lotId,'');
 assert.equal(draft.values.number,'');
 assert.equal(draft.values.solarPrice_0,'');
 assert.equal(draft.values.down,'');
 assert.equal(draft.values.months,'84');
 assert.equal(draft.values.date,'2026-11-23');
 assert.equal(draft.selectedLotId,'');
 assert.deepEqual(lots,JSON.parse(before),'Los solares reales no se eliminan');
});
test('al quitar el primer solar se conserva el otro, precio y prima correctos',()=>{
 const draft={mode:'manual',selectedLotId:'L1',values:{
  ...primary,solarPrice_1:'295000',solarDown_1:'15000',solarPrice_2:'345000',
  solarDown_2:'25000',extraStage_0:'2',extraLotId_0:'L2',extraStage_1:'2',extraLotId_1:'L3'},
  extraLots:[
   {stage:'2',lotId:'L2',price:'295000',down:'15000'},
   {stage:'2',lotId:'L3',price:'345000',down:'25000'}
  ]};
 const changed=removePrimary(draft,getLot);
 assert.equal(changed,'L2');
 assert.equal(draft.selectedLotId,'L2');
 assert.equal(draft.values.lotId,'L2');
 assert.equal(draft.values.stage,'2');
 assert.equal(draft.values.block,'C');
 assert.equal(draft.values.number,'3');
 assert.equal(draft.values.solarPrice_0,'295000');
 assert.equal(draft.values.solarDown_0,'15000');
 assert.equal(draft.values.down,'15000');
 assert.equal(draft.values.solarPrice_1,'345000');
 assert.equal(draft.values.solarDown_1,'25000');
 assert.equal(draft.values.extraLotId_0,'L3');
 assert.equal(draft.extraLots.length,1);
 assert.equal(draft.extraLots[0].lotId,'L3');
 assert.equal(draft.values.solarPrice_2,undefined,'No queda precio de un solar eliminado');
});
test('un solar adicional sin elegir no se promociona ni altera precios anteriores',()=>{
 const draft={mode:'manual',selectedLotId:'L1',values:{...primary,solarPrice_1:'',solarDown_1:'',extraLotId_0:'',extraStage_0:'1'},extraLots:[{stage:'1',lotId:'',price:'',down:''}]};
 assert.equal(removePrimary(draft,getLot),null);
 assert.equal(draft.values.lotId,'');
 assert.equal(draft.values.solarPrice_0,'');
 assert.equal(draft.extraLots.length,1,'Los selectores extras abiertos siguen visibles');
});
