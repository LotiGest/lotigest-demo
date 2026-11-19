// Catálogo transcrito del PDF «precios de lotes (1).pdf EDITADO.pdf», 18-11-2026.
// Cada fila: [números de solar, m², varas² impresas, L/vara², prima PDF,
// cuota PDF, precio total PDF]. Solo bloques y rótulos coincidentes:
// L (12), N (2-13), O (8) pendientes por erratas de bloque del PDF.
export const OFFICIAL_LOT_PRICE_GROUPS = {
A:[
['1',165.96,238.02,2300,54744.56,5865.49,547445.61],
['2',161,230.91,2300,53108.43,5690.19,531084.26],
['3',156,223.74,2300,51459.10,5513.47,514590.96],
['4',149,213.70,2300,49150.03,5266.08,491500.34],
['5',140,200.79,2300,46181.24,4947.99,461812.40],
['6',131,187.88,2300,43212.45,4629.90,432124.46],
['7',124,177.84,2300,40903.38,4382.51,409033.84],
['8',121,173.54,2300,39913.79,4276.48,399137.86],
['9',99.5,142.70,2300,32821.67,3516.61,328216.67],
['10',115,164.93,2300,37934.59,4064.42,379345.90]],
B:[
['2-5,8-11',154,220.87,2300,50799.36,5442.79,507993.64],
['6-7',154,220.87,2500,55216.70,5916.08,552167],
['1',218,312.66,2300,71910.79,7704.73,719107.88],
['12',274,392.97,2300,90383.28,9683.92,903832.84]],
C:[
['2-5,7-10',154,220.87,2300,50799.36,5442.79,507993.64],
['1,6',154,220.87,2500,55216.70,5916.08,552167],
['11',268,384.37,2300,88404.09,9471.87,884040.88],
['12',286,410.18,2300,94341.68,10108.04,943416.76]],
D:[
['1-10,13-18,20-26',154,220.87,2300,50799.36,5442.79,507993.64],
['11-12',154,220.87,2500,55216.70,5916.08,552167],
['19',148,212.26,2300,48820.17,5230.73,488201.68]],
E:[
['2-3,5-7,10-16',154,220.87,2300,50799.36,5442.79,507993.64],
['1,17',154,220.87,2500,55216.70,5916.08,552167],
['4',148,212.26,2300,48820.17,5230.73,488201.68],
['8',254,364.29,2300,83785.96,8977.07,837859.64],
['9',242,347.08,2300,79827.57,8552.95,798275.72]],
F:[
['1-14,17-30',176,252.42,2300,58056.42,6220.33,580564.16],
['15-16',176,252.42,2500,63104.80,6761.23,631048]],
G:[
['2-8,11-17',176,252.42,2300,58056.42,6220.33,580564.16],
['1,18',176,252.42,2500,63104.80,6761.23,631048],
['9-10',192,275.37,2500,68841.60,7375.89,688416]],
H:[
['2-8',198,283.97,2300,65313.47,6997.87,653134.68],
['12-17',206,295.45,2300,67952.40,7280.61,679523.96],
['1,9',198,283.97,2500,70992.90,7606.38,709929],
['10',216,309.79,2500,77446.80,8297.87,774468],
['11',225,322.70,2300,74219.85,7952.13,742198.50],
['18',206,295.45,2500,73861.30,7913.71,738613]],
I:[
['2-9,12-19',165,236.64,2300,54427.89,5831.56,544278.90],
['1,11',165,236.64,2500,59160.75,6338.65,591607.50],
['10',232,332.73,2300,76528.91,8199.53,765289.12],
['20',202,289.71,2300,66632.93,7139.24,666329.32]],
J:[
['2-9,12-19',165,236.64,2300,54427.89,5831.56,544278.90],
['1,11',165,236.64,2500,59160.75,6338.65,591607.50],
['10',224,321.26,2300,73889.98,7916.78,738899.84],
['20',228,327,2300,75209.45,8058.16,752094.48]],
K:[
['2-5,8-11',154,220.87,2300,50799.36,5442.79,507993.64],
['1,7',154,220.87,2500,55216.70,5916.08,552167],
['6',191,273.93,2300,63004.41,6750.47,630044.06],
['12',193,276.80,2300,63664.14,6821.16,636641.38]],
M:[
['2-6,9-13',154,220.87,2300,50799.36,5442.79,507993.64],
['1,8',154,220.87,2500,55216.70,5916.08,552167],
['7',220,315.52,2300,72570.52,7775.41,725705.20],
['14',165,236.64,2300,54427.89,5831.56,544278.90]],
N:[['1',292,418.79,2500,104696.60,11217.49,1046966]],
Ñ:[
['2-10,12,14-22',165,236.64,2300,54427.89,5831.56,544278.90],
['1',154,220.87,2500,55216.70,5916.08,552167],
['11',165,236.64,2500,59160.75,6338.65,591607.50],
['13',286,410.18,2300,94341.68,10108.04,943416.76]]
};
export function officialPriceCatalog(){
 const rows=[];
 for(const [block,groups] of Object.entries(OFFICIAL_LOT_PRICE_GROUPS))
  for(const [spec,area,varas,unit,down,monthly,total] of groups)
   for(const entry of spec.split(',').map(x=>x.trim())){
    const [a,b=a]=entry.split('-').map(Number);
    for(let number=a;number<=b;number++)rows.push({stage:1,block,number,area,varas,unit,down,monthly,total});
   }
 return rows;
}
const priceNorm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
export function isAvailableForPricing(state,lot){
 return Boolean(lot&&lot.status==='available'&&lot.type!=='private'&&lot.type!=='commercial'&&!lot.ownerClientId&&!lot.historyRequiresReview&&!state.sales.some(s=>s.lotId===lot.id)&&!(state.reservations||[]).some(r=>r.lotId===lot.id&&r.status==='active')&&!(state.ownershipStatements||[]).some(s=>(s.references||[]).some(r=>r.lotId===lot.id)));
}
export function quoteAtZeroInterest(total,down,months){
 const price=Number(total),prima=Number(down),n=Number(months);
 if(!Number.isFinite(price)||price<=0||!Number.isFinite(prima)||prima<0||prima>price||!Number.isInteger(n)||n<1||n>360)throw Error('Revisa precio, prima y cantidad de cuotas.');
 return Math.round(((price-prima)/n+Number.EPSILON)*100)/100;
}
export function prepareOfficialPriceFill(state,residenceId){
 const residence=state.residences?.find(r=>r.id===residenceId);
 if(!residence||!priceNorm(residence.name).includes('ALTOS DEL ARRAYAN'))throw Error('Los precios corresponden únicamente a Altos del Arrayán.');
 const next=JSON.parse(JSON.stringify(state)),changes=[],skipped=[],missing=[],conflicts=[];
 for(const source of officialPriceCatalog()){
  const matches=next.lots.filter(l=>l.residenceId===residenceId&&Number(l.stage)===source.stage&&priceNorm(l.block)===source.block&&Number(l.sourceNumber)===source.number&&l.type!=='commercial');
  const key='Etapa 1 / '+source.block+' / '+source.number;
  if(matches.length!==1){(matches.length?conflicts:missing).push(key);continue;}
  const lot=matches[0];
  if(!isAvailableForPricing(next,lot)){skipped.push(key+' (ocupado, apartado o protegido)');continue;}
  if(Number(lot.price)>0&&Math.abs(Number(lot.price)-source.total)>.01){conflicts.push(key+' (precio existente diferente)');continue;}
  const before=JSON.stringify(lot);
  if(!(Number(lot.price)>0))lot.price=source.total;
  if(!(Number(lot.area)>0)){lot.area=source.area;lot.areaMode='manual';lot.areaOrigin='pdf-tabla-precios';}
  lot.priceVara2??=source.unit;
  lot.areaVaras2??=source.varas;
  lot.pdfPrima??=source.down;
  lot.pdfCuota??=source.monthly;
  lot.pdfPrecioTotal??=source.total;
  lot.quotePrima??=source.down;
  lot.quoteMonths??=84;
  lot.priceSource??='PDF precios de lotes · Altos del Arrayán · 18-11-2026';
  if(JSON.stringify(lot)!==before)changes.push(key);
 }
 return {state:next,changes,skipped,missing,conflicts,excludedPdfRows:32,catalogCount:officialPriceCatalog().length};
}