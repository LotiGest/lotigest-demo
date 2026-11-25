
 // Preferencias de comunicaciones. No almacenar credenciales ni activar envíos sin conexión oficial.
 function lgWhatsAppStatementSettings(state=db){
  const s=state.company?.whatsappStatements||{};
  return {phone:typeof s.phone==='string'?s.phone:'',day:Number.isInteger(s.day)&&s.day>=1&&s.day<=28?s.day:25,hour:Number.isInteger(s.hour)&&s.hour>=8&&s.hour<=18?s.hour:9,consents:s.consents&&typeof s.consents==='object'?s.consents:{}};
 }
 function lgStatementMessage(m,company,phone){
  const cash=n=>'L '+(n/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  return 'Buen día, '+m.client+'. Le saludamos cordialmente de '+company+' – '+m.residence+'. Le compartimos su estado de cuenta al '+m.asOf+'.\n\n'+
   'Cuota mensual: '+cash(m.base)+'\nTotal pagado (incluye prima): '+cash(m.paid)+'\nMensualidades pendientes al corte: '+cash(m.total)+'\n'+
   (m.prima>0?'Prima pendiente: '+cash(m.prima)+'\n':'')+
   'Saldo total del contrato: '+cash(m.balance)+'\n\n'+
   'El saldo total incluye las cuotas futuras; no representa necesariamente el importe exigible hoy. '+(m.total>0||m.prima>0?'Si ya realizó algún pago, con gusto revisamos su comprobante. ':'Gracias por mantenerse al día. ')+
   'Para cualquier consulta o aclaración, estamos a su disposición'+(phone?' al +'+phone:'')+'. Muchas gracias por su confianza.';
 }
// Identidad de documentos: un logo general y otro independiente por residencial.
// No cambia la identidad de LOTIGEST, los pagos ni el inventario.
function lgValidDocLogo(l){return l&&typeof l.data==='string'&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(l.data)&&Number.isInteger(l.width)&&Number.isInteger(l.height)&&l.width>0&&l.height>0&&l.width<=1600&&l.height<=1600?l:null;}
function lgDocumentBranding(rid,state=db){
 const r=(state.residences||[]).find(x=>x.id===rid);
 const logos=state.company?.residenceLogos||{};
 const explicit=r&&Object.prototype.hasOwnProperty.call(logos,r.id);
 const fallback=r&&/altos\s+del\s+arrayan/i.test(r.name.normalize('NFD').replace(/[\u0300-\u036f]/g,''))&&typeof pmStatementArrayanLogo!=='undefined'?{data:'data:image/jpeg;base64,'+pmStatementArrayanLogo,width:600,height:224}:null;
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
  return '<section class="card card-padding" id="lg-document-brand-settings"><h3>Logos de documentos impresos</h3><div class="form-grid"><div class="field-group"><label>Logo general · '+esc(db.company.name||'GRUPO H')+'</label><div>'+preview(b.company,'Logo general')+'</div><label class="btn btn-primary">Cambiar logo<input id="company-logo-file" type="file" accept="image/png,image/jpeg,image/webp" hidden></label> <button class="btn btn-outline" type="button" data-action="company-logo-remove">Quitar</button></div><div class="field-group"><label for="lg-brand-residence">Residencial</label><select id="lg-brand-residence">'+(db.residences||[]).map(r=>'<option value="'+esc(r.id)+'" '+(r.id===rid?'selected':'')+'>'+esc(r.name)+'</option>').join('')+'</select><div>'+preview(b.residential,b.name)+'</div><label class="btn btn-primary">Cambiar logo residencial<input id="lg-residence-logo-file" type="file" accept="image/png,image/jpeg,image/webp" hidden></label> <button type="button" class="btn btn-outline" id="lg-residence-logo-remove">Quitar</button></div></div><small class="muted">PNG, JPG o WebP. Hasta 1600 píxeles de resolución, conservando las proporciones. Cada residencial conserva su propio logo.</small></section>';
 };
 function refresh(){const old=document.getElementById('lg-document-brand-settings');if(!old){render();return;}const t=document.createElement('template');t.innerHTML=documentLogoSettings();old.replaceWith(t.content);}
 async function convert(file){
  if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>12*1024*1024)throw Error('Selecciona PNG, JPG o WebP de hasta 12 MB.');
  const img=await createImageBitmap(file);
  try{const canvas=document.createElement('canvas'),scale=Math.min(1,1600/Math.max(img.width,img.height));canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);return {data:canvas.toDataURL('image/jpeg',.94),width:canvas.width,height:canvas.height};}finally{img.close();}
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
 receiptLetterPdf=function(parts,company,reference,kind='receipt',qrUrl=null){return letter(parts,company,reference,kind,qrUrl,lgDocumentBranding(documentRid));};
 const payment=paymentReceiptPdf;
 paymentReceiptPdf=function(id){const rows=paymentReceiptRows(id);const ids=[...new Set(rows.map(p=>getLot(getSale(p.saleId)?.lotId)?.residenceId).filter(Boolean))];return scoped(ids.length===1?ids[0]:null,()=>payment(id));};
 const owner=ownerPaymentPdf;
 ownerPaymentPdf=function(id){const p=(db.ownerPayments||[]).find(x=>x.id===id);return scoped(p?.residenceId,()=>owner(id));};
 const quote=makeClientQuotePdf;
 makeClientQuotePdf=function(request,...args){return scoped(getLot(request.lotId)?.residenceId||request.residenceId,()=>quote(request,...args));};
 const doc=documentHtml;
 documentHtml=function(type,id){const sale=type==='contract'?getSale(id):getSale(db.payments.find(p=>p.id===id)?.saleId);const html=doc(type,id);return html.replace('<div class="print-sheet">','<div class="print-sheet">'+lgDocumentBrandHtml(getLot(sale?.lotId)?.residenceId));};
})();

(function installWhatsAppStatementSettings(){
 const previous=settingsPage;
 const options=(arr,selected)=>arr.map(([v,n])=>'<option value="'+esc(v)+'" '+(String(v)===String(selected)?'selected':'')+'>'+esc(n)+'</option>').join('');
 function markup(){
  if(cloudUser?.role!=='admin')return '';
  const s=lgWhatsAppStatementSettings(),clients=(db.clients||[]).filter(c=>clientWhatsappPhone(c.phone)).sort((a,b)=>a.name.localeCompare(b.name,'es'));
  return '<section class="card card-padding" id="lg-wa-settings"><h3>WhatsApp · Estados de cuenta</h3><p class="sm">Conexión automática pendiente de WhatsApp Business. No se enviarán mensajes automáticamente todavía.</p>'+
   '<form id="lg-wa-config"><div class="form-grid"><label>Número de WhatsApp de la empresa<input name="phone" type="tel" placeholder="+504 9999-9999" value="'+esc(s.phone)+'" required></label>'+
   '<label>Día mensual previsto<select name="day">'+options(Array.from({length:28},(_,i)=>[i+1,i+1]),s.day)+'</select></label>'+
   '<label>Hora prevista (Honduras)<select name="hour">'+options(Array.from({length:11},(_,i)=>[i+8,String(i+8).padStart(2,'0')+':00']),s.hour)+'</select></label></div>'+
   '<p class="sm">Horario guardado para una futura conexión oficial. Solo se enviarán avisos autorizados y no se cargarán credenciales aquí.</p><button type="submit" class="btn btn-primary">Guardar configuración</button></form>'+
   '<details style="margin-top:12px"><summary>Autorización del cliente para recibir estados de cuenta</summary><form id="lg-wa-consent"><label>Cliente<select name="client" required><option value="">Seleccionar cliente</option>'+options(clients.map(c=>[c.id,c.name+' · '+c.phone+(s.consents[c.id]===clientWhatsappPhone(c.phone)?' · Autorizado':'')]),'')+'</select></label><label><input type="checkbox" name="confirmed"> El cliente autorizó recibir sus estados de cuenta en este número.</label><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="submit" class="btn btn-primary" name="intent" value="grant">Registrar autorización</button><button type="submit" class="btn btn-outline" name="intent" value="revoke">Revocar autorización</button></div></form></details>'+
   '<p class="sm">Mensaje: saludo cordial, cuota mensual, total pagado, mensualidades pendientes, saldo contractual y contacto para aclaraciones. El PDF conserva ambos logos configurados.</p></section>';
 }
 settingsPage=function(){return markup()+previous();};
 document.addEventListener('submit',async e=>{
  const form=e.target;if(!['lg-wa-config','lg-wa-consent'].includes(form.id))return;
  e.preventDefault();e.stopImmediatePropagation();
  try{
   if(cloudUser?.role!=='admin'||!cloudReady||cloudBlocked||cloudOffline)throw Error('Se requiere administrador conectado.');
   const s=lgWhatsAppStatementSettings(),d=new FormData(form);
   if(form.id==='lg-wa-config'){
    const phone=clientWhatsappPhone(d.get('phone'));if(!phone)throw Error('Número de WhatsApp inválido.');
    const day=Number(d.get('day')),hour=Number(d.get('hour'));if(!Number.isInteger(day)||day<1||day>28||!Number.isInteger(hour)||hour<8||hour>18)throw Error('Horario inválido.');
    Object.assign(s,{phone:'+'+phone,day,hour});
   }else{
    const c=getClient(d.get('client')),phone=clientWhatsappPhone(c?.phone);if(!c||!phone)throw Error('Selecciona un cliente con teléfono válido.');
    s.consents={...s.consents};
    if(e.submitter?.value==='revoke')delete s.consents[c.id];
    else{if(!d.has('confirmed'))throw Error('Confirma que el cliente autorizó el envío.');s.consents[c.id]=phone;}
   }
   const next={...db,company:{...db.company,whatsappStatements:s}};
   cloudWrite(JSON.stringify(next));db=next;await cloudFlush();render();toast('Preferencias de WhatsApp guardadas. Envío automático pendiente de conexión.');
  }catch(err){toast(err.message,'error');}
 },true);
})();
