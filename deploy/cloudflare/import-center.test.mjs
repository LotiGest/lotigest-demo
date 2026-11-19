import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

function runHub({role='admin',page='lots'}={}){
 const source=readFileSync(new URL('./import-center-ui.js',import.meta.url),'utf8');
 const events=new Map(),logs={modal:null,preview:[],toast:[],template:[]};
 const mock={
  cloudReady:true,cloudUser:{role},SESSION:'TEST',sessionStorage:{getItem:()=> 'yes'},
  page,pages:{lots:['Terrenos'],clients:['Clientes'],collections:['Cobros'],contracts:['Contratos'],arrayan:['Mapa de solares']},
  document:{addEventListener:(t,f)=>events.set(t,f),getElementById:()=>({value:''})},
  residence:()=>({name:'Altos del Arrayán'}),esc:String,showModal:(title,body,footer,wide,subtitle)=>{logs.modal={title,body,footer,wide,subtitle};},
  header:(title,subtitle,actions='')=>title+' | '+actions,
  toast:(message)=>logs.toast.push(message),buyerColumns:['Codigo','Bloque','Numero','Nombre','Identidad','Prima'],
  lotImportPreview:null,buyerImportPreview:null,ledgerPreview:null,
  lotImportReadVersion:0,buyerImportReadVersion:0,ledgerReadVersion:0,
  previewLotMeasures:async file=>logs.preview.push('measures '+file.name),
  previewBuyerImport:async file=>logs.preview.push('buyers '+file.name),
  readLedgerFile:async file=>logs.preview.push('payments '+file.name),
  importResidentialMap:async file=>logs.preview.push('map '+file.name),
  chooseContractScanClient:()=>logs.preview.push('contract chooser'),
  downloadExcel:(name,headers)=>logs.template.push({name,headers}),
  ledgerExcelTemplate:()=>logs.template.push({name:'Plantilla_primas_abonos.xlsx'})
 };
 const names=Object.keys(mock);
 const app=new Function(...names,source+';return {importHubOpen,importHubFile,importHubTemplate,importHubIsAdmin,header};')(...Object.values(mock));
 return {app,logs,events};
}
test('una sola ventana por panel, con Excel y previa sin guardar datos',async()=>{
 const {app,logs}=runHub();
 assert.match(app.header('Terrenos','x'),/data-import-hub-open/);
 for(const [mode,name,preview] of [
  ['measures','terr.xlsx','measures terr.xlsx'],
  ['buyers','clientes.xlsx','buyers clientes.xlsx'],
  ['payments','abonos.xlsx','payments abonos.xlsx']
 ]){
  app.importHubOpen(mode);
  assert.equal(logs.modal.title,'Centro de importaciones');
  assert.match(logs.modal.body,/id="import-hub-file"/);
  assert.match(logs.modal.footer,/Confirmar importación/);
  assert.match(logs.modal.footer,/disabled/);
  await app.importHubFile({name,size:2048});
  assert.equal(logs.preview.at(-1),preview);
 }
 assert.equal(await app.importHubFile({name:'datos.exe',size:1}).then(()=>false,()=>true),true);
 assert.deepEqual(logs.toast,[]);
});
test('mapa PDF y contratos usan la misma ventana y exigen vínculo del cliente',async()=>{
 const {app,logs}=runHub({page:'arrayan'});
 app.importHubOpen('map');
 assert.equal(logs.modal.subtitle,'Croquis PDF');
 await app.importHubFile({name:'Altos-plan.pdf',size:2000});
 assert.equal(logs.preview.at(-1),'map Altos-plan.pdf');
 app.importHubOpen('contracts');
 assert.match(logs.modal.body,/Elegir cliente y escanear contrato/);
 assert.doesNotMatch(logs.modal.body,/id="import-hub-file"/);
});
test('plantillas Excel reales y acceso solo del administrador',()=>{
 const admin=runHub();
 admin.app.importHubTemplate('buyers');
 assert.match(admin.logs.template[0].name,/\.xlsx$/);
 const readonly=runHub({role:'sales'});
 assert.equal(readonly.app.importHubIsAdmin(),false);
 assert.doesNotMatch(readonly.app.header('Terrenos','x'),/data-import-hub-open/);
 readonly.app.importHubOpen('payments');
 assert.equal(readonly.logs.modal,null);
 assert.ok(readonly.logs.toast.length);
});
