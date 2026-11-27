import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {intakeSolarCandidates} from '../../contract-intake-core.mjs';
const source=readFileSync(new URL('./contract-intake-ui.js',import.meta.url),'utf8');
const start=source.indexOf('function contractIntakeFields(){');
const end=source.indexOf('function contractIntakeOpen(',start);
if(start<0||end<=start)throw Error('No se encontró el formulario del contrato.');
const make=stage=>{
 const c={name:'CLIENTE FICTICIO',identity:'0801 1990 00021',block:'G',number:'16',stage};
 const working={values:c,preferredClientId:'',selectedLotId:''};
 const lots=[
  {id:'E1G16',stage:1,block:'G',sourceNumber:'16',status:'available',area:176},
  {id:'E2G16',stage:2,block:'G',sourceNumber:'16',status:'available',area:180},
  {id:'E2G17',stage:2,block:'G',sourceNumber:'17',status:'available',area:150}
 ];
 const sourceFn=source.slice(source.indexOf('function contractIntakeExtraFields('),source.indexOf('function contractIntakeRemovePrimaryDraft('))+source.slice(start,end);
 const render=new Function('contractIntakeWorking','residenceLots','db','esc','intakeSolarCandidates','normalizeClientLookup','getLot',sourceFn+';return contractIntakeFields;')(
  working,()=>lots,{sales:[],clients:[]},String,intakeSolarCandidates,x=>String(x||'').replace(/\s/g,''),id=>lots.find(l=>l.id===id));
 return render();
};
test('Etapa no se infiere: aparece selector con Etapa 1 y Etapa 2',()=>{
 const html=make(null);
 assert.match(html,/name="stage"/);
 assert.match(html,/>Etapa 1</);
 assert.match(html,/>Etapa 2</);
 assert.match(html,/Primero elige Etapa 1 o Etapa 2/);
 assert.doesNotMatch(html,/value="E1G16" selected/);
 assert.doesNotMatch(html,/value="E2G16" selected/);
});
test('Tras elegir Etapa 1 solo selecciona el solar G16 de la primera etapa',()=>{
 const html=make(1);
 assert.match(html,/value="1" selected/);
 assert.match(html,/value="E1G16" selected/);
 assert.doesNotMatch(html,/value="E2G16"/);
});
test('Tras elegir Etapa 2 solo selecciona G16 de la segunda etapa',()=>{
 const html=make(2);
 assert.match(html,/value="2" selected/);
 assert.match(html,/value="E2G16" selected/);
 assert.doesNotMatch(html,/value="E1G16"/);
});
