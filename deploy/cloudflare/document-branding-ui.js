// Identidad de documentos: un logo general y otro independiente por residencial.
// No cambia la identidad de LOTIGEST, los pagos ni el inventario.
function lgValidDocLogo(l){return l&&typeof l.data==='string'&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(l.data)&&Number.isInteger(l.width)&&Number.isInteger(l.height)&&l.width>0&&l.height>0&&l.width<=1000&&l.height<=1000?l:null;}
function lgDocumentBranding(rid,state=db){
 const r=(state.residences||[]).find(x=>x.id===rid);
 const logos=state.company?.residenceLogos||{};
 const explicit=r&&Object.prototype.hasOwnProperty.call(logos,r.id);
 const fallback=r&&/altos\s+del\s+arrayan/i.test(r.name.normalize('NFD').replace(/[\u0300-\u036f]/g,''))&&typeof pmStatementArrayanLogo!=='undefined'?{data:'data:image/jpeg;base64,'+pmStatementArrayanLogo,width:175,height:64}:null;
 return {company:lgValidDocLogo(state.company?.logo),residential:lgValidDocLogo(explicit?logos[r.id]:fallback),name:r?.name||''};
}
function lgDocLogoCommand(logo,key,x,y,w,h){
 if(!logo)return '';
 const scale=Math.min(w/logo.width,h/logo.height),a=logo.width*scale,b=logo.height*scale;
 return 'q '+a+' 0 0 '+b+' '+(x+(w-a)/2)+' '+(y+(h-b)/2)+' cm /'+key+' Do Q';
}
function lgDocLogoObject(logo){
 const bytes=atob(logo.data.split(',')[1]);
 return '<< /Type /XObject /Subtype /Image /Width '+logo.width+' /Height '+logo.height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+bytes.length+' >>\nstream\n'+bytes+'\nendstream';
}
function lgDocumentBrandHtml(rid){
 const b=lgDocumentBranding(rid);
 return '<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin:0 0 12px">'+[['company','Logo de la empresa'],['residential',b.name||'Logo de la residencial']].filter(([k])=>b[k]).map(([k,label])=>'<img src="'+esc(b[k].data)+'" alt="'+esc(label)+'" style="max-width:210px;max-height:85px;object-fit:contain">').join('')+'</div>';
}
(function installDocumentBranding(){
 let selectedRid=null;
 function preview(logo,label){return logo?'<img src="'+esc(logo.data)+'" alt="'+esc(label)+'" style="max-width:190px;max-height:90px;object-fit:contain">':'<span class="sm muted">Sin logo personalizado</span>';}
 documentLogoSettings=function(){
  const rid=(db.residences||[]).some(r=>r.id===selectedRid)?selectedRid:residence().id;
  const b=lgDocumentBranding(rid);
  return '<section class="card card-padding" id="lg-document-brand-settings"><h3>Logos de documentos impresos</h3><div class="form-grid"><div class="field-group"><label>Logo general · '+esc(db.company.name||'GRUPO H')+'</label><div>'+preview(b.company,'Logo general')+'</div><label class="btn btn-primary">Cambiar logo<input id="company-logo-file" type="file" accept="image/png,image/jpeg,image/webp" hidden></label> <button class="btn btn-outline" type="button" data-action="company-logo-remove">Quitar</button></div><div class="field-group"><label for="lg-brand-residence">Residencial</label><select id="lg-brand-residence">'+(db.residences||[]).map(r=>'<option value="'+esc(r.id)+'" '+(r.id===rid?'selected':'')+'>'+esc(r.name)+'</option>').join('')+'</select><div>'+preview(b.residential,b.name)+'</div><label class="btn btn-primary">Cambiar logo residencial<input id="lg-residence-logo-file" type="file" accept="image/png,image/jpeg,image/webp" hidden></label> <button type="button" class="btn btn-outline" id="lg-residence-logo-remove">Quitar</button></div></div><small class="muted">PNG, JPG o WebP. Cada residencial conserva su propio logo.</small></section>';
 };
 function refresh(){const old=document.getElementById('lg-document-brand-settings');if(!old){render();return;}const t=document.createElement('template');t.innerHTML=documentLogoSettings();old.replaceWith(t.content);}
 async function convert(file){
  if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>12*1024*1024)throw Error('Selecciona PNG, JPG o WebP de hasta 12 MB.');
  const img=await createImageBitmap(file);
  try{const canvas=document.createElement('canvas'),scale=Math.min(1,700/Math.max(img.width,img.height));canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);return {data:canvas.toDataURL('image/jpeg',.86),width:canvas.width,height:canvas.height};}finally{img.close();}
 }
 function persist(rid,logo){
  if(cloudUser?.role!=='admin'||!cloudReady||cloudBlocked)throw Error('Se requiere acceso de administrador y guardado disponible.');
  if(!(db.residences||[]).some(r=>r.id===rid))throw Error('Residencial no encontrada.');
  const next={...db,company:{...db.company,residenceLogos:{...(db.company.residenceLogos||{}),[rid]:logo}}};
  cloudWrite(JSON.stringify(next));db=next;refresh();toast('Logo residencial guardado. Verifica la sincronización.');
 }
 document.addEventListener('change',async event=>{
  if(event.target.id==='lg-brand-residence'){selectedRid=event.target.value;refresh();return;}
  if(event.target.id!=='lg-residence-logo-file')return;
  const file=event.target.files?.[0],rid=document.getElementById('lg-brand-residence')?.value;if(!file)return;
  try{if(cloudUser?.role!=='admin')throw Error('Solo un administrador puede cambiar logos.');const logo=await convert(file);persist(rid,logo);}catch(e){toast(e.message,'error');}
 });
 document.addEventListener('click',event=>{
  if(event.target.closest?.('#lg-residence-logo-remove'))try{persist(document.getElementById('lg-brand-residence')?.value,null);}catch(e){toast(e.message,'error');}
 });
 // El ámbito se deriva del documento, no de la residencial actualmente seleccionada.
 let documentRid=null;
 function scoped(rid,fn){const before=documentRid;documentRid=rid||null;try{return fn();}finally{documentRid=before;}}
 const letter=receiptLetterPdf;
 receiptLetterPdf=function(...args){return letter(...args,lgDocumentBranding(documentRid));};
 const payment=paymentReceiptPdf;
 paymentReceiptPdf=function(id){const rows=paymentReceiptRows(id);const ids=[...new Set(rows.map(p=>getLot(getSale(p.saleId)?.lotId)?.residenceId).filter(Boolean))];return scoped(ids.length===1?ids[0]:null,()=>payment(id));};
 const owner=ownerPaymentPdf;
 ownerPaymentPdf=function(id){const p=(db.ownerPayments||[]).find(x=>x.id===id);return scoped(p?.residenceId,()=>owner(id));};
 const quote=makeClientQuotePdf;
 makeClientQuotePdf=function(request,...args){return scoped(getLot(request.lotId)?.residenceId||request.residenceId,()=>quote(request,...args));};
 const doc=documentHtml;
 documentHtml=function(type,id){const sale=type==='contract'?getSale(id):getSale(db.payments.find(p=>p.id===id)?.saleId);const html=doc(type,id);return html.replace('<div class="print-sheet">','<div class="print-sheet">'+lgDocumentBrandHtml(getLot(sale?.lotId)?.residenceId));};
})();
