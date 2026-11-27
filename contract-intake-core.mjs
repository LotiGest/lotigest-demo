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
// Validar identidad hondureña como 13 cifras. Se respeta su formato original al mostrarla.
export function contractIdentityDigits(value){return String(value||'').replace(/\D/g,'');}
export function contractIdentityFormat(value){
 const digits=contractIdentityDigits(value);
 return digits.length===13?digits.slice(0,4)+' '+digits.slice(4,8)+' '+digits.slice(8):String(value||'').trim();
}
function contractIntakeDni(src,field){
 // Extrae desde la etiqueta DNI/IDENTIDAD (no desde representante o las observaciones).
 const label=/^(?:NUMERO\s+DE\s+)?(?:DNI|IDENTIDAD)(?:\s+(?:NO|NUMERO))?\s*[:.\-]?\s*(.*)$/im;
 const match=src.match(label);
 const candidate=match?.[1]||field('DNI|IDENTIDAD');
 // El OCR puede poner los grupos en una línea aparte.
 const following=match?src.slice(match.index+match[0].length).split('\n')[1]||'':'';
 for(const fragment of [candidate,following]){
  const found=fragment.match(/(?<!\d)\d{4}[\s.-]*\d{4}[\s.-]*\d{5}(?!\d)/);
  if(found)return contractIdentityFormat(found[0]);
 }
 // No usar otro número del documento (ni DNI de un representante) si el principal está ilegible.
 return contractIdentityFormat(candidate.replace(/^(?:DNI|IDENTIDAD)\s*[:.\-]?\s*/,''));
}
function contractIntakeObservations(src){
 const match=src.match(/(?:^|\n)\s*OBSERVACIONES\s*:?\s*([\s\S]*?)(?=\n\s*FIRMA\s+DE\s+AUTORIZACION\b|$)/i);
 if(!match)return '';
 return match[1].replace(/\s*\n\s*/g,' ').trim().slice(0,5000);
}
export function parseContractIntake(text){
 const src=intakeNormalize(text).slice(0,50000);
 const field=(key,next='[A-ZÁÉÍÓÚÑ ]{2,40}')=>intakeSection(src,key,next);
 const amount=key=>intakeMoney(field(key));
 const rawYears=field('TIEMPO\\s+DE\\s+CONTRATO|PLAZO\\s+DEL\\s+CONTRATO');
 const term=rawYears.match(/(\d{1,3})\s*(?:CUOTAS?|MESES?)/)||rawYears.match(/(\d{1,2})\s*A[NÑ]OS?/);
 const months=term?(/A[NÑ]O/.test(term[0])?Number(term[1])*12:Number(term[1])):null;
 const number=field('LOTE(?:\\s*\\(\\s*[S5]\\s*\\)|S)?|SOLAR(?:ES|\\s*\\(\\s*E?[S5]\\s*\\))?');
 const numbers=[...new Set(number.replace(/\s+Y\s+/g,',').split(/[,;\/]/).map(x=>x.trim()).filter(x=>/^\d+[A-Z]?$/.test(x)))];
 const block=field('BLOQUE(?:\\s*\\(\\s*[S5]\\s*\\)|S)?');
 const stage=field('ETAPA(?:\\s+DEL\\s+PROYECTO)?');
 const areaVaras=amount('AREA(?:\\s+EN\\s+VARAS)?');
 const areaM2=amount('METROS\\s+CUADRADOS|AREA\\s+M2');
 const results={
  name:field('NOMBRE\\s+DE\\s+CLIENTE|NOMBRE\\s+DEL\\s+CLIENTE'),
  identity:contractIntakeDni(src,field),rtn:field('RTN'),maritalStatus:field('ESTADO\\s+CIVIL'),
  occupation:field('PROFESI[OÓ]N\\s+U\\s+OFICIO|PROFESI[OÓ]N|OFICIO'),
  address:field('DIRECCI[OÓ]N|DOMICILIO'),
  stage:stage&&/^\d{1,2}$/.test(stage)?Number(stage):null,
  block:block.match(/^[A-Z0-9]+/)?.[0]||'',
  number:number.match(/^\d+[A-Z]?/)?.[0]||'',numbers,
  areaVaras,areaM2,
  north:field('NORTE'),south:field('SUR'),east:field('ESTE'),west:field('OESTE'),
  price:amount('PRECIO\\s+DE\\s+LOTE|PRECIO\\s+TOTAL'),
  down:amount('VALOR\\s+DE\\s+PRIMA|PRIMA'),
  financed:amount('SALDO\\s+A\\s+FINANCIAR'),
  monthly:amount('CUOTA(?:\\s+MENSUAL)?'),months,
  pricePerVara:amount('PRECIO\\s+POR\\s+VARA2?'),
  observations:contractIntakeObservations(src),
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
 // Las fichas de Clientes ya verificadas por su identificador se reutilizan sin
 // exigir documento nuevo. La identidad es opcional; si se proporciona se valida.
 if(str(input.identity)&&contractIdentityDigits(input.identity).length!==13&&input.existingClientVerified!==true)
  errors.push('El DNI debe contener exactamente 13 dígitos. Revisa la lectura OCR o escríbelo manualmente.');
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

// Una ficha puede repartir sus importes entre varios solares del mismo cliente.
// No se supone que el total del documento corresponda a CADA solar.
export function intakePlanLots(data,lots,residenceId){
 const entries=Array.isArray(data.lots)&&data.lots.length?data.lots:[data];
 const seen=new Set(),multi=entries.length>1;
 const cents=v=>Math.round(Number(v)*100);
 const planned=entries.map(entry=>{
  const lot=(lots||[]).find(l=>l.id===entry.lotId);
  if(!lot||lot.residenceId!==residenceId)throw Error('Selecciona cada solar de la residencial actual.');
  if(seen.has(lot.id))throw Error('No puedes agregar el mismo solar dos veces.');seen.add(lot.id);
  const price=multi?entry.price:data.price,down=multi?entry.down:data.down;
  if(multi&&(price===''||price==null||down===''||down==null))throw Error('Indica el precio y la prima pactada de cada solar, sin repetir el total de la ficha.');
  for(const value of [price,down])if(!Number.isFinite(Number(value))||!Number.isSafeInteger(cents(value))||Math.abs(Number(value)*100-cents(value))>.00001)throw Error('Los importes por solar deben tener hasta dos decimales.');
  const fields={...data,...entry,lotId:lot.id,stage:Number(entry.stage),block:multi?lot.block:data.block,number:multi?String(lot.sourceNumber||lot.number||''):data.number,price:Number(price),down:Number(down),
   financed:multi?(cents(price)-cents(down))/100:data.financed,monthly:multi?null:data.monthly};
  const issues=intakeCheckValues(fields,lot);if(issues.length)throw Error(issues.join(' '));
  if(multi){fields.documentAreaM2=data.areaM2;fields.documentAreaVaras=data.areaVaras;fields.areaM2=null;fields.areaVaras=null;}
  delete fields.lots;return {lot,fields};
 });
 if(multi){
  if(planned.reduce((s,r)=>s+cents(r.fields.price),0)!==cents(data.price))throw Error('La suma de precios de los solares debe coincidir con el precio total de la ficha.');
  if(planned.reduce((s,r)=>s+cents(r.fields.down),0)!==cents(data.down))throw Error('La suma de primas de los solares debe coincidir con la prima total de la ficha.');
 }
 return planned;
}

// Un apartado solo se convierte al registrar la venta del mismo titular.
export function intakeReservationFor(state,lotId,clientId){
 const active=(state.reservations||[]).filter(r=>r.lotId===lotId&&r.status==='active');
 if(active.length>1||active.some(r=>r.clientId!==clientId))throw Error('El solar tiene un apartado vigente de otro cliente o requiere conciliación.');
 return active[0]||null;
}
export function intakeConvertReservation(state,lot,sale,at){
 if(!lot||!sale||sale.lotId!==lot.id)throw Error('Venta y solar no coinciden.');
 const r=intakeReservationFor(state,lot.id,sale.clientId);
 if(r){r.status='converted';r.saleId=sale.id;r.convertedAt=at;lot.reservationId=null;}
 return r;
}
