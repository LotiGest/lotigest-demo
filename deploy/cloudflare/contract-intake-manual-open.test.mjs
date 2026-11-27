import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('./contract-intake-ui.js',import.meta.url),'utf8');
const start=ui.indexOf("function contractIntakeOpen(clientId=''");
const end=ui.indexOf('// Recursos versionados servidos por el mismo sitio',start);
if(start<0||end<=start)throw Error('No se encontró el formulario del contrato.');

function open(mode){
 const dialogs=[];
 const client={id:'C1',name:'CLIENTE DE PRUEBA',identity:'0801 1990 00021',address:'HONDURAS'};
 const mocks={
  contractIntakeLocalToday:()=> '2026-11-26',contractQuickDefaults:null,contractIntakeWorking:null,
  contractIntakeAdmin:()=>true,
  toast:message=>{throw Error(message);},
  getClient:id=>id==='C1'?client:null,
  residence:()=>({id:'R'}),
  contractIntakeFields:()=>'<form id="contract-intake-form">Campos de contrato</form>',
  showModal:(...args)=>dialogs.push(args)
 };
 const names=Object.keys(mocks),app=new Function(...names,ui.slice(start,end)+';return {open:contractIntakeOpen,draft:()=>contractIntakeWorking};')(...Object.values(mocks));
 app.open('C1',mode);
 return {dialog:dialogs[0],draft:app.draft()};
}
test('Clientes abre de inmediato la ficha manual prellenada y sin selector de OCR',()=>{
 const {dialog,draft}=open('manual');
 assert.equal(draft.mode,'manual');
 assert.equal(draft.preferredClientId,'C1');
 assert.equal(draft.values.name,'CLIENTE DE PRUEBA');
 assert.equal(draft.values.identity,'0801 1990 00021');
 assert.equal(dialog[0],'Nuevo contrato');
 assert.match(dialog[2],/Guardar contrato/);
 assert.match(dialog[1],/contract-intake-form/);
 assert.doesNotMatch(dialog[1],/contract-intake-file/);
 assert.doesNotMatch(dialog[2],/disabled/);
});
test('Contratos conserva la opción de subir foto y rellenar por OCR',()=>{
 const {dialog,draft}=open('ocr');
 assert.equal(draft.mode,'ocr');
 assert.match(dialog[1],/contract-intake-file/);
 assert.match(dialog[2],/disabled/);
});
