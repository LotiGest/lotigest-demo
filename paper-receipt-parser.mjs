// OCR del talonario rosado GRUPO H: saldo anterior y actual nunca son el abono.
const norm = text => String(text||'').normalize('NFKC').replace(/\r/g,'').replace(/[‐‑–]/g,'-');
const trim = text => String(text||'').replace(/\s+/g,' ').trim();
function paperAmount(raw){
 let s=String(raw||'').replace(/^(?:L\.?|LPS\.?|HNL)\s*/i,'').replace(/[Oo]/g,'0').replace(/[Il|]/g,'1').replace(/[^\d.,]/g,'');
 if(/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(s))s=s.replace(/,/g,'');
 else if(/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(s))s=s.replace(/\./g,'').replace(',','.');
 else if(/^\d+,\d{1,2}$/.test(s))s=s.replace(',','.');
 if(!/^\d+(?:\.\d{1,2})?$/.test(s))return null;
 const cents=Math.round(Number(s)*100);
 return Number.isSafeInteger(cents)&&cents>0&&cents<=1e12?cents/100:null;
}
function paperIso(day,month,year){
 const d=Number(day),m=Number(month),y=Number(year);
 if(y<1990||y>2100||m<1||m>12||d<1||d>31)return null;
 const iso=String(y)+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
 const dt=new Date(iso+'T12:00:00Z');
 return !Number.isNaN(+dt)&&dt.toISOString().slice(0,10)===iso?iso:null;
}
function receiptDate(text){
 let m=text.match(/\b(20\d{2})[-\/.](\d{1,2})[-\/.](\d{1,2})\b/);
 if(m)return paperIso(m[3],m[2],m[1]);
 m=text.match(/\b(\d{1,2})[-\/.](\d{1,2})[-\/.](20\d{2})\b/);
 if(m)return paperIso(m[1],m[2],m[3]);
 // El talonario separa las cifras en columnas: Día / Mes / Año.
 m=text.match(/D[ií1]a\s*[:.]?\s*(?:\n\s*)?(\d{1,2})[\s\S]{0,32}?Mes\s*[:.]?\s*(?:\n\s*)?(\d{1,2})[\s\S]{0,32}?A[nñ]o\s*[:.]?\s*(?:\n\s*)?(20\d{2})/i);
 if(m)return paperIso(m[1],m[2],m[3]);
 const t=text.match(/D[ií1]a\s*[|:]?\s*Mes\s*[|:]?\s*A[nñ]o([\s\S]{0,120})/i);
 if(t){m=t[1].match(/(\d{1,2})\D+(\d{1,2})\D+(20\d{2})/);if(m)return paperIso(m[1],m[2],m[3]);}
 return null;
}
export function extractPaperReceipt(original){
 const text=norm(original),rows=text.split('\n'),candidates=[];
 const patterns=[
  /\bPor\s*(?:Lps?\.?|Lempiras)\s*[:.\-]?\s*(?:L\.?\s*)?([\d][\d.,OoIl ]{0,18})/gi,
  /\b(?:Abono\s+de\s+hoy|Cantidad\s+recibida|Monto\s+pagado|Total\s+recibido)\s*[:=.]?\s*(?:L\.?\s*)?([\d][\d.,OoIl ]{0,18})/gi
 ];
 for(const re of patterns)for(const m of text.matchAll(re)){
  const n=paperAmount(m[1]);if(n!==null)candidates.push(n);
 }
 const amounts=[...new Set(candidates)];
 let reference=null;
 // Impreso rojo junto a «RECIBO DE CAJA»: Nº 00006159.
 // El OCR puede confundir cero con O y uno con I/l; solo corregir en la zona numérica.
 const folio=text.match(/(?:N\s*[°ºoO.]|N[oú]m(?:ero)?\.?|Folio\s*[:#]|Recibo\s*N\s*[°ºoO.]|No\.)\s*[:#-]?\s*([0-9OoIl|][0-9OoIl|\s]{3,16})\b/i);
 if(folio){
  const digits=folio[1].replace(/[Oo]/g,'0').replace(/[Il|]/g,'1').replace(/\s/g,'');
  if(/^\d{4,12}$/.test(digits))reference=digits;
 }
 let name=null;
 const nm=text.match(/Recib[ií1]\s+de\s*[:=]?\s*([^\n]{3,120})/i);
 if(nm){name=trim(nm[1].split(/\s+(?:La\s+cantidad|Por\s+concepto|Dia|Día)\s*[:=]?/i)[0]).slice(0,120)||null;}
 let concept=null;
 const cm=text.match(/Por\s+concepto\s+de\s*[:=]?\s*([^\n]{3,180})/i);
 if(cm)concept=trim(cm[1]).slice(0,180);
 const warnings=[];
 if(amounts.length>1)warnings.push('Hay varios importes marcados como pago. Confirma el valor del abono.');
 if(amounts.length===0)warnings.push('No se leyó el importe de «Por Lps.» o «Abono de hoy». Escríbelo manualmente.');
 const date=receiptDate(text);if(!date)warnings.push('No se leyó una fecha confiable. Comprueba día, mes y año del recibo.');
 if(!reference)warnings.push('No se detectó un número de recibo legible.');
 return {amount:amounts.length===1?amounts[0]:null,date,name,concept,reference,warnings};
}
