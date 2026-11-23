import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {extractPaperReceipt} from '../../paper-receipt-parser.mjs';

const source=readFileSync(new URL('./multi-date-abonos-ui.js',import.meta.url),'utf8');
const start=source.indexOf(' function mdOcrAngles');
const end=source.indexOf(' function mdValidate(){',start);
assert.ok(start>=0&&end>start,'Helpers de lectura de recibos accesibles en el módulo');
const funcs=source.slice(start,end);
const compile=new Function('document','window','mdById','mdRenderRows','mdToday','mdHumanDate','mdMoneyText',
 'decodeContractIntakeImage','loadContractIntakeOcr','location','URL','createImageBitmap',
 funcs+';return {mdOcr,mdOcrAngles};');
function scenario({workerError=false,edited=false}={}){
 const row={id:'R1',photo:{type:'image/jpeg'},date:'2026-11-22',amount:edited?'2500':'',
  receiptRef:'',dateEdited:false,amountEdited:edited,refEdited:false};
 const status={textContent:''},requests=[],canvases=[],mockDoc={
  querySelector:()=>status,
  createElement:tag=>{
   assert.equal(tag,'canvas');
   const c={width:0,height:0,getContext:()=>({
    fillRect(){},drawImage(){},rotate(){},translate(){},fillStyle:'#fff'
   })};
   canvases.push(c);return c;
  }
 };
 let draws=0,terminated=0,renders=0;
 const api=compile(mockDoc,{lotigestPaperReceipt:{extractPaperReceipt}},
  id=>id===row.id?row:null,()=>renders++,
  ()=>'2026-11-23',()=> '21 Octubre 2026',
  n=>Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}),
  async()=>({width:864,height:1536,close(){}}),
  async()=>({createWorker:async(language,engine,options)=>{
   requests.push({language,engine,options});
   if(workerError)throw Error('No se pudo iniciar OCR local');
   return {recognize:async canvas=>{
    draws++;
    return {data:{text:canvas.width>canvas.height?
     'Por Lps. 10,000.00\nDía Mes Año\n21 10 2026\nRECIBO DE CAJA Nº 00006159':
     ''}};
   },terminate:async()=>{terminated++;}};
  }}),
  {origin:'https://lotigestpro.pages.dev'},
  {createObjectURL:()=>'',revokeObjectURL(){}},
  async()=>{throw Error('No se debe usar decodificación alternativa');});
 return {api,row,status,requests,stats:()=>({draws,terminated,renders})};
}
test('giro automático y extracción de fecha, N.º y Por Lps. de la foto lateral',async()=>{
 const s=scenario();
 assert.deepEqual(s.api.mdOcrAngles(864,1536),[-90,90,0]);
 await s.api.mdOcr(s.row);
 assert.equal(s.row.receiptRef,'00006159');
 assert.equal(s.row.date,'2026-10-21');
 assert.equal(s.row.amount,'10000');
 assert.match(s.row.status,/Por Lps.: 10,000\.00/);
 assert.match(s.row.status,/21 Octubre 2026/);
 assert.match(s.row.status,/00006159/);
 assert.equal(s.stats().draws,1,'Al reconocer los tres campos no gira otras veces');
 assert.equal(s.stats().terminated,1);
 assert.equal(s.requests[0].options.workerBlobURL,false);
 assert.match(s.requests[0].options.workerPath,/\/ocr\/v5\/worker\.min\.js$/);
});
test('el OCR no cambia un monto escrito manualmente',async()=>{
 const s=scenario({edited:true});await s.api.mdOcr(s.row);
 assert.equal(s.row.amount,'2500');
 assert.equal(s.row.receiptRef,'00006159');
 assert.equal(s.row.date,'2026-10-21');
});
test('si falla el lector local muestra motivo y opción de reintentar, sin guardar pagos',async()=>{
 const s=scenario({workerError:true});await s.api.mdOcr(s.row);
 assert.match(s.row.status,/No se pudo iniciar OCR local/);
 assert.match(s.row.status,/Reintentar OCR/);
 assert.equal(s.stats().renders,1);
});
