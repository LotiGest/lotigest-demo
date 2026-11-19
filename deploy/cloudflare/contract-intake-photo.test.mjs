import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseContractIntake,contractIdentityDigits,contractIdentityFormat} from '../../contract-intake-core.mjs';
const source=readFileSync(new URL('./contract-intake-ui.js',import.meta.url),'utf8');
const reader=source.slice(source.indexOf('async function contractIntakeRead(file){'),source.indexOf('function contractIntakeData(form){'));
for(const [width,height] of [[4000,6000],[6000,4000],[900,1400]])test(`OCR recibe toda la fotografía ${width} × ${height}, incluido el extremo derecho`,async()=>{
 const working={readVersion:0,values:{}},status={isConnected:true},box={},save={};let closed=0,terminated=0,draw;
 const bitmap={width,height,close(){closed++;}};
 const canvas={width:0,height:0,getContext(){return {fillRect(){},drawImage(...args){draw=args;}};}};
 const ocrText='NOMBRE DE CLIENTE: CLIENTE FICTICIO DE PRUEBA\nDNI: 0801 1990 00021\nLOTE (S): 16\nBLOQUE (S): G';
 const options=[];
 const env={contractIntakeWorking:working,document:{getElementById:id=>({'contract-intake-status':status,'contract-intake-review':box,'contract-intake-save':save}[id]),createElement:()=>canvas},decodeContractIntakeImage:async()=>bitmap,
  loadContractIntakeOcr:async()=>({createWorker:async(...args)=>{options.push(args);return {recognize:async image=>{
   assert.equal(image,canvas);
   // El argumento de destino debe reducir la imagen ENTERA, nunca recortarla.
   assert.equal(draw.length,5);assert.deepEqual(draw.slice(1),[0,0,canvas.width,canvas.height]);
   assert.ok(canvas.width<=2200&&canvas.height<=2200);
   assert.ok(Math.abs(canvas.width/canvas.height-width/height)<.001);
   return {data:{text:ocrText,confidence:94}};
  },terminate:async()=>{terminated++;}};}}),location:{origin:'https://lotigest.test'},
  parseContractIntake,contractIdentityDigits,contractIdentityFormat,contractIntakeFields:()=>'<form>Ficha</form>'};
 await new Function(...Object.keys(env),reader+';return contractIntakeRead;')(...Object.values(env))({size:3000000,type:'image/jpeg'});
 assert.equal(working.values.name,'CLIENTE FICTICIO DE PRUEBA');assert.equal(working.values.identity,'0801 1990 00021');
 assert.equal(working.values.block,'G');assert.equal(working.values.number,'16');assert.equal(working.values.stage,null);
 assert.equal(save.disabled,false);assert.match(status.textContent,/DNI del titular encontrado/);
 assert.equal(options[0][2].workerPath,'https://lotigest.test/ocr/v5/worker.min.js');assert.equal(options[0][2].workerBlobURL,false);assert.equal(closed,1);assert.equal(terminated,1);assert.equal(working.busy,false);
});

test('fallo del motor muestra la causa y permite reintentar la misma foto sin perder datos',async()=>{
 const file={size:1000,type:'image/jpeg'},previous={name:'CLIENTE REVISADO',identity:'0801 1990 00021',stage:2};
 const scan={readVersion:0,values:{...previous}},status={},box={},save={},retry={hidden:true};let closed=0;
 const canvas={getContext:()=>({fillRect(){},drawImage(){}})};
 const env={contractIntakeWorking:scan,document:{getElementById:id=>({'contract-intake-status':status,'contract-intake-review':box,'contract-intake-save':save,'contract-intake-retry':retry}[id]),createElement:()=>canvas},
  decodeContractIntakeImage:async()=>({width:1000,height:1500,close(){closed++;}}),loadContractIntakeOcr:async()=>({createWorker:async()=>{throw 'Failed to fetch language';}}),
  location:{origin:'https://lotigest.test'},contractIntakeFields:()=>'<form>Datos conservados</form>'};
 await new Function(...Object.keys(env),reader+';return contractIntakeRead;')(...Object.values(env))(file);
 assert.match(status.textContent,/Failed to fetch language/);assert.match(status.textContent,/Volver a leer/);
 assert.deepEqual(scan.values,previous);assert.equal(scan.file,file);assert.equal(scan.busy,false);
 assert.equal(retry.hidden,false);assert.equal(retry.disabled,false);assert.equal(save.disabled,false);assert.equal(closed,1);
});

test('JPG que falla en createImageBitmap se abre con el decodificador de imágenes y libera el enlace temporal',async()=>{
 const helper=source.slice(source.indexOf('async function decodeContractIntakeImage(file){'),source.indexOf('async function contractIntakeRead(file){'));
 let revoked='',src='';class I{naturalWidth=1200;naturalHeight=1800;set src(value){src=value;this.onload();}}
 const decode=new Function('createImageBitmap','URL','Image',helper+';return decodeContractIntakeImage;')(
  async()=>{throw Error('No se pudo decodificar');},{createObjectURL:()=> 'blob:foto-local',revokeObjectURL:value=>{revoked=value;}},I);
 const image=await decode({});assert.equal(image.width,1200);assert.equal(image.height,1800);assert.equal(src,'blob:foto-local');assert.equal(revoked,src);assert.ok(image.image instanceof I);
});
