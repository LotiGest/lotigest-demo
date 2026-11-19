// Lector de ficha contractual de Altos del Arrayán.
// Analiza texto OCR; los datos extraídos siempre se muestran para revisión humana.
export const contractIntakeLabels=Object.freeze({
 name:'Nombre del cliente',identity:'Identidad / DNI',rtn:'RTN',maritalStatus:'Estado civil',
 occupation:'Profesión u oficio',address:'Dirección',stage:'Etapa',block:'Bloque',number:'Solar',
 areaVaras:'Varas²',areaM2:'Metros cuadrados',north:'Norte',south:'Sur',east:'Este',west:'Oeste',
 price:'Precio del lote',down:'Prima pactada',financed:'Saldo a financiar',monthly:'Cuota mensual',months:'Número de cuotas',
 pricePerVara:'Precio por vara²',observations:'Observaciones'
});
function intakeNormalize(src){
 return String(src||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\r/g,'').replace(/\u00b2/g,'2').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').toUpperCase();
}
function intakeSection(text,start,next){
 const r=new RegExp('(?:^|\\n)[ \\t]*(?:'+start+')[ \\t]*[:\\-]?[ \\t]*(.*?)(?=\\n|$)','im');
 const lines=text.match(r);
 if(lines){
  const value=String(lines[1]||'').trim();
  if(value)return value.replace(/^[:\-]\s*/,'');
  const rest=text.slice(lines.index+lines[0].length).split('\n').find(x=>x.trim());
  const heading=/^(?:GENERALES|SOBRE|COLINDANCIAS|DATOS|NOMBRE|DNI|IDENTIDAD|RTN|ESTADO|PROFESION|DIRECCION|DOMICILIO|LOTE|SOLAR|BLOQUE|AREA|METROS|NORTE|SUR|ESTE|OESTE|PRECIO|VALOR|SALDO|CUOTA|TIEMPO|OBSERVACIONES|FIRMA)\b/i;
  if(rest&&!heading.test(rest.trim())&&!new RegExp('^(?:'+next+')\\s*[:\\-]?','i').test(rest.trim()))return rest.trim();
 }
 return '';
}
export function intakeMoney(raw){
 const cleaned=String(raw??'').replace(/[L$]/gi,'').replace(/(?:LEMPIRAS?|LPS?\.?)/gi,'').replace(/,/g,'').replace(/\s+/g,'').trim();
 if(!cleaned)return null;
 const hit=cleaned.match(/-?\d+(?:\.\d{1,2})?/);
 if(!hit)return null;
 const n=Number(hit[0]);return Number.isFinite(n)&&n>=0&&n<=1e12?n:null;
}
export function parseContractIntake(text){
 const src=intakeNormalize(text).slice(0,50000);
 const field=(key,next='[A-ZÁÉÍÓÚÑ ]{2,40}')=>intakeSection(src,key,next);
 const amount=key=>intakeMoney(field(key));
 const rawYears=field('TIEMPO\\s+DE\\s+CONTRATO|PLAZO\\s+DEL\\s+CONTRATO');
 const term=rawYears.match(/(\d{1,3})\s*(?:CUOTAS?|MESES?)/)||rawYears.match(/(\d{1,2})\s*A[NÑ]OS?/);
 const months=term?(/A[NÑ]O/.test(term[0])?Number(term[1])*12:Number(term[1])):null;
 const number=field('LOTE\\s*\\(?S\\)?|SOLAR(?:ES)?');
 const block=field('BLOQUE\\s*\\(?S\\)?');
 const stage=field('ETAPA(?:\\s+DEL\\s+PROYECTO)?');
 const areaVaras=amount('AREA(?:\\s+EN\\s+VARAS)?');
 const areaM2=amount('METROS\\s+CUADRADOS|AREA\\s+M2');
 const results={
  name:field('NOMBRE\\s+DE\\s+CLIENTE|NOMBRE\\s+DEL\\s+CLIENTE'),
  identity:field('DNI|IDENTIDAD'),rtn:field('RTN'),maritalStatus:field('ESTADO\\s+CIVIL'),
  occupation:field('PROFESI[OÓ]N\\s+U\\s+OFICIO|PROFESI[OÓ]N|OFICIO'),
  address:field('DIRECCI[OÓ]N|DOMICILIO'),
  stage:stage&&/^\d{1,2}$/.test(stage)?Number(stage):null,
  block:block.match(/^[A-Z0-9]+/)?.[0]||'',
  number:number.match(/^\d+[A-Z]?/)?.[0]||'',
  areaVaras,areaM2,
  north:field('NORTE'),south:field('SUR'),east:field('ESTE'),west:field('OESTE'),
  price:amount('PRECIO\\s+DE\\s+LOTE|PRECIO\\s+TOTAL'),
  down:amount('VALOR\\s+DE\\s+PRIMA|PRIMA'),
  financed:amount('SALDO\\s+A\\s+FINANCIAR'),
  monthly:amount('CUOTA(?:\\s+MENSUAL)?'),months,
  pricePerVara:amount('PRECIO\\s+POR\\s+VARA2?'),
  observations:field('OBSERVACIONES'),
  rawText:String(text||'').slice(0,50000)
 };
 // Los documentos sin etapa NO se asignan automáticamente a etapa 1 o 2.
 return results;
}
// La etapa SIEMPRE la elige quien ingresa el contrato. El OCR solo propone bloque y solar.
export function intakeSolarCandidates(lots,stage,block,number){
 const requestedStage=Number(stage);
 if(![1,2].includes(requestedStage))return [];
 const clean=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'').trim();
 const requestedBlock=clean(block),requestedNumber=clean(number).replace(/^0+(?=\d)/,'');
 if(!requestedBlock||!requestedNumber)return [];
 return (lots||[]).filter(l=>
  l&&l.status!=='private'&&l.type!=='private'&&Number(l.stage)===requestedStage&&
  clean(l.block)===requestedBlock&&clean(l.sourceNumber||l.number).replace(/^0+(?=\d)/,'')===requestedNumber);
}
export function intakeCheckValues(input,lot){
 const errors=[];
 if(!lot)errors.push('Selecciona el solar exacto, incluida la etapa.');
 const str=v=>String(v||'').trim();
 if(str(input.name).length<3)errors.push('Falta el nombre del cliente.');
 if(!/^[0-9\s-]{10,22}$/.test(str(input.identity)))errors.push('Revisa el DNI.');
 const price=Number(input.price),down=Number(input.down),months=Number(input.months);
 if(!Number.isFinite(price)||price<=0||price>1e12)errors.push('El precio total debe ser positivo.');
 if(!Number.isFinite(down)||down<0||down>=price)errors.push('La prima debe ser menor que el precio.');
 if(!Number.isInteger(months)||months<1||months>360)errors.push('Revisa el plazo en meses.');
 if(lot&&String(input.lotId)!==String(lot.id))errors.push('El solar no coincide.');
 if(![1,2].includes(Number(input.stage)))errors.push('Debes elegir manualmente Etapa 1 o Etapa 2.');
 if(lot&&Number(input.stage)!==Number(lot.stage))errors.push('El solar no pertenece a la etapa indicada.');
 const selected=intakeSolarCandidates(lot?[lot]:[],input.stage,input.block,input.number);
 if(lot&&selected.length!==1)errors.push('El bloque y número del OCR no coinciden con el solar seleccionado. Revisa el contrato.');
 if(lot&&(lot.status==='private'||lot.type==='private'))errors.push('Una propiedad privada no se puede registrar como venta.');
 // Las diferencias de medidas son advertencias, nunca se sobreescriben ni bloquean la ficha.
 // El usuario puede conservar la cifra del contrato junto al valor original del inventario.
 return errors;
}
export function intakeResetPreview(db){
 const count=k=>Array.isArray(db?.[k])?db[k].length:0;
 return {
  clients:count('clients'),sales:count('sales'),payments:count('payments'),
  reservations:count('reservations'),contractTexts:count('contractTexts'),
  historicalPayments:count('historicalPayments'),historicalContracts:count('historicalContracts'),
  ownerPayments:count('ownerPayments'),ownershipStatements:count('ownershipStatements'),
  preservedLots:count('lots'),preservedResidences:count('residences'),
  cashEntriesKept:count('cashEntries')
 };
}

/**
 * Construye una COPIA que elimina las relaciones históricas del padrón, no el catastro.
 * Se ejecuta exclusivamente tras respaldo descargado y una confirmación humana expresa.
 */
export function intakePrepareFreshClientRegister(state){
 const next=structuredClone(state);
 for(const key of [
  'clients','sales','payments','reservations','contractTexts',
  'historicalPayments','historicalContracts','ownerPayments','ownershipStatements','ledgerImportBatches'
 ]){if(Array.isArray(next[key]))next[key]=[];}
 // Conservar todos los solares, su área, medidas, varas, etapa, bloque, precio y posición.
 // Solo retirar claves de referencia a un comprador o un apartado que ya no existe.
 for(const lot of next.lots||[]){
  for(const key of ['ownerClientId','clientId','reservationId','ownerName','buyerName','pendingContractId']){
   if(Object.prototype.hasOwnProperty.call(lot,key))delete lot[key];
  }
 }
 // Las marcas de venta del croquis siguen en el inventario hasta conciliar cada contrato.
 // Los ingresos y gastos manuales de Caja NO se modifican silenciosamente.
 next.clientRegisterReset={at:new Date().toISOString(),version:1,
  note:'Padrón regenerado desde contratos; cifras del catastro y movimientos independientes de Caja preservados'};
 return next;
}
