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
 const env={contractIntakeWorking:working,document:{getElementById:id=>({'contract-intake-status':status,'contract-intake-review':box,'contract-intake-save':save}[id]),createElement:()=>canvas},createImageBitmap:async()=>bitmap,
  loadContractOcr:async()=>({createWorker:async(...args)=>{options.push(args);return {recognize:async image=>{
   assert.equal(image,canvas);
   // El argumento de destino debe reducir la imagen ENTERA, nunca recortarla.
   assert.equal(draw.length,5);assert.deepEqual(draw.slice(1),[0,0,canvas.width,canvas.height]);
   assert.ok(canvas.width<=2200&&canvas.height<=2200);
   assert.ok(Math.abs(canvas.width/canvas.height-width/height)<.001);
   return {data:{text:ocrText,confidence:94}};
  },terminate:async()=>{terminated++;}};}}),contractOcrCdn:'https://cdn.jsdelivr.net/npm/tesseract.js@5.0.0/dist/',
  parseContractIntake,contractIdentityDigits,contractIdentityFormat,contractIntakeFields:()=>'<form>Ficha</form>'};
 await new Function(...Object.keys(env),reader+';return contractIntakeRead;')(...Object.values(env))({size:3000000,type:'image/jpeg'});
 assert.equal(working.values.name,'CLIENTE FICTICIO DE PRUEBA');assert.equal(working.values.identity,'0801 1990 00021');
 assert.equal(working.values.block,'G');assert.equal(working.values.number,'16');assert.equal(working.values.stage,null);
 assert.equal(save.disabled,false);assert.match(status.textContent,/DNI del titular encontrado/);
 assert.match(options[0][2].workerPath,/tesseract.js@5.0.0/);assert.equal(closed,1);assert.equal(terminated,1);assert.equal(working.busy,false);
});
