import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./contract-map-lime-ui.js',import.meta.url),'utf8');
function fixture(state='available',hasDoc=true){
 const lot={id:'L16',residenceId:'R',status:state,stage:2,block:'G',sourceNumber:'16',area:176};
 const document={id:'OCR16',lotId:'L16',clientId:'C1',status:'pending-sale',format:'photo+ocr',structured:{name:'CLIENTE FICTICIO'}};
 const db={lots:[lot],contractTexts:hasDoc?[document]:[],clients:[{id:'C1',name:'CLIENTE FICTICIO'}]};
 const svgFeature={key:'F1',stage:2,block:'G',number:'16'};
 const colors={reserved:'#e8ab38',sold:'#5dc39a',debt:'#e97980',available:'#f4cd71',private:'#c6d0d4'};
 const api=new Function('db','arrayanColors','arrayanRecord','arrayanPage','arrayanDetails','residence','residenceFeatures','getClient','arrayanSelected','arrayanFilter','esc',source+
  ';return {record:arrayanRecord,page:arrayanPage,details:arrayanDetails,colors:arrayanColors};')(
  db,colors,()=>({lot:null,status:state,data:{},rs:[]}),()=>'<div><p>Filtros</p></div><div class="page-cols">Mapa</div>',
  ()=>'<strong style="color:#A3E635">Disponible</strong><select id="ar-status"><option value="available" selected>Amarillo · Disponible</option></select><button class="btn btn-primary" data-action="arrayan-save">Guardar solar</button>',
  ()=>({id:'R'}),()=>[svgFeature],id=>db.clients.find(c=>c.id===id),'F1','all',String);
 return {api,lot,db,feature:svgFeature};
}
test('contrato guardado pinta el solar verde limón, aunque no se haya activado la venta',()=>{
 const {api,feature}=fixture();
 assert.equal(api.colors.contracted,'#A3E635');
 assert.equal(api.record(feature).status,'contracted');
 assert.equal(api.record(feature).lot.id,'L16');
 assert.match(api.page(),/Contrato registrado: 1/);
 assert.match(api.details(),/Contrato registrado/);
 assert.match(api.details(),/CLIENTE FICTICIO/);
 assert.match(api.details(),/data-contract-ficha-view="OCR16"/);
 assert.match(api.details(),/Gestionar contrato desde Contratos/);
});
test('si todavía no se ha cargado contrato, el solar conserva su estado y color',()=>{
 const {api,feature}=fixture('available',false);
 assert.equal(api.record(feature).status,'available');
 assert.match(api.page(),/Contrato registrado: 0/);
});
test('mora y apartados tienen prioridad sobre verde limón',()=>{
 for(const kind of ['debt','reserved','private']){
  const {api,feature}=fixture(kind,true);
  assert.equal(api.record(feature).status,kind);
 }
});
test('no se confunden dos solares con igual bloque/número en etapas diferentes',()=>{
 const {api,db,feature}=fixture();
 db.lots.unshift({id:'E1G16',residenceId:'R',status:'available',stage:1,block:'G',sourceNumber:'16'});
 assert.equal(api.record(feature).lot.id,'L16');
 const wrong={...feature,stage:1};
 assert.equal(api.record(wrong).status,'available');
});
