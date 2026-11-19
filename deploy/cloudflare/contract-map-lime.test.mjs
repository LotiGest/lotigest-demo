import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./contract-map-lime-ui.js',import.meta.url),'utf8');
function fixture(state='available',hasDoc=true){
 const lot={id:'L16',residenceId:'R',status:state,stage:2,block:'G',sourceNumber:'16',area:176};
 const document={id:'OCR16',lotId:'L16',clientId:'C1',status:'pending-sale',format:'photo+ocr',structured:{name:'CLIENTE FICTICIO'}};
 const db={lots:[lot],contractTexts:hasDoc?[document]:[],clients:[{id:'C1',name:'CLIENTE FICTICIO'}],sales:[],payments:[],ownerPayments:[],historicalPayments:[]};
 const svgFeature={key:'F1',stage:2,block:'G',number:'16'};
 const colors={reserved:'#e8ab38',sold:'#5dc39a',debt:'#e97980',available:'#f4cd71',private:'#c6d0d4'};
 const api=new Function('db','arrayanColors','arrayanRecord','arrayanPage','arrayanDetails','residence','residenceFeatures','getClient','arrayanSelected','arrayanFilter','esc','geoStatusColor','mapVisualStatus',source+
  ';return {record:arrayanRecord,page:arrayanPage,details:arrayanDetails,colors:arrayanColors,geoColor:geoStatusColor,hasPrima:contractMapHasRecordedPrima};')(
  db,colors,()=>({lot:null,status:state,data:{},rs:[]}),()=>'<div><p>Filtros</p></div><div class="page-cols">Mapa</div>',
  ()=>'<strong style="color:#A3E635">Disponible</strong><select id="ar-status"><option value="available" selected>Amarillo · Disponible</option></select><button class="btn btn-primary" data-action="arrayan-save">Guardar solar</button>',
  ()=>({id:'R'}),()=>[svgFeature],id=>db.clients.find(c=>c.id===id),'F1','all',String,()=>colors[state]||colors.sold,()=>state);
 return {api,lot,db,feature:svgFeature};
}
test('contrato guardado pinta el solar verde limón, aunque no se haya activado la venta',()=>{
 const {api,feature}=fixture();
 assert.equal(api.record(feature).status,'contracted');
 assert.equal(api.colors.contracted,'#A3E635');
 assert.equal(api.record(feature).lot.id,'L16');
 assert.match(api.page(),/Contrato registrado \(sin prima\): 1/);
 assert.match(api.details(),/Contrato registrado/);
 assert.match(api.details(),/CLIENTE FICTICIO/);
 assert.match(api.details(),/data-contract-ficha-view="OCR16"/);
 assert.match(api.details(),/Gestionar contrato desde Contratos/);
});
test('si todavía no se ha cargado contrato, el solar conserva su estado y color',()=>{
 const {api,feature}=fixture('available',false);
 assert.equal(api.record(feature).status,'available');
 assert.match(api.page(),/Contrato registrado \(sin prima\): 0/);
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

test('una prima pactada en el contrato sin pago no cambia el verde limón',()=>{
 const {db,lot,api,feature}=fixture();
 db.sales.push({id:'V-1',lotId:lot.id,clientId:'C1',type:'credit',downPayment:50000,openingPaid:0});
 assert.equal(api.record(feature).status,'contracted');
 assert.equal(api.colors.contracted,'#A3E635');
 assert.equal(api.hasPrima(lot),false);
});
test('primer abono realmente guardado a prima convierte verde limón en verde corazón',()=>{
 const {db,lot,api,feature}=fixture();
 db.sales.push({id:'V-1',lotId:lot.id,clientId:'C1',type:'credit',downPayment:50000,openingPaid:0});
 db.payments.push({id:'R-1',saleId:'V-1',amount:1500,concept:'Abono a crédito'});
 assert.equal(api.record(feature).status,'prima-paid');
 assert.equal(api.colors['prima-paid'],'#16A34A');
 assert.match(api.page(),/Prima registrada: 1/);
 assert.match(api.details(),/💚 Prima registrada/);
 assert.match(api.details(),/Puede estar incompleta/);
 assert.equal(api.geoColor(lot),'#16A34A');
});
test('el registro de prima manual vinculada a un solo solar también lo identifica',()=>{
 const {db,lot,api,feature}=fixture('sold');
 db.ownerPayments.push({id:'OP-1',clientId:'C1',residenceId:'R',concept:'Prima histórica',amountCents:20000,allocations:[{amountCents:20000,references:[{lotId:lot.id}]}]});
 assert.equal(api.record(feature).status,'prima-paid');
});
test('un pago conjunto de prima sin distribución no colorea todos los solares',()=>{
 const {db,lot,api,feature}=fixture('sold');
 db.ownerPayments.push({id:'OP-1',clientId:'C1',residenceId:'R',concept:'Prima',amountCents:5000000,allocations:[{amountCents:5000000,references:[{lotId:lot.id},{lotId:'L17'}]}]});
 assert.equal(api.record(feature).status,'contracted');
});
test('documentación de prima histórica con solar exacto identificado sí cambia el color',()=>{
 const {db,lot,api,feature}=fixture('sold');
 db.historicalPayments.push({id:'H1',type:'PRIMA',residenceId:'R',lotId:lot.id,clientId:'C1',amountCents:5000000});
 assert.equal(api.record(feature).status,'prima-paid');
});
test('abono cero o anulado y cuotas normales sin prima pactada no cambian de color',()=>{
 const {db,lot,api,feature}=fixture('sold');
 db.sales.push({id:'V1',lotId:lot.id,clientId:'C1',type:'credit',downPayment:0,openingPaid:0});
 db.payments.push({saleId:'V1',amount:2500,concept:'Cuota'});
 db.ownerPayments.push({residenceId:'R',clientId:'C1',concept:'Prima',amountCents:20000,voidedAt:'2026-11-19',allocations:[{amountCents:20000,references:[{lotId:'L16'}]}]});
 assert.equal(api.record(feature).status,'contracted');
});
test('mora prevalece sobre verde de prima para no esconder cuotas vencidas',()=>{
 const {db,lot,api,feature}=fixture('debt');
 db.ownerPayments.push({residenceId:'R',clientId:'C1',concept:'Prima',amountCents:20000,allocations:[{amountCents:20000,references:[{lotId:lot.id}]}]});
 assert.equal(api.record(feature).status,'debt');
 assert.equal(api.geoColor(lot),'#e97980');
});
