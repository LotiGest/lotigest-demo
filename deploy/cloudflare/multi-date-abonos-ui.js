(function installLotigestMultiDateAbonos(){
 'use strict';
 let mdState=null,mdSaving=false,mdSaved=null;
 const mdById=id=>mdState?.rows.find(r=>r.id===id);
 const mdRoot=()=>document.getElementById('md-abonos-form');
 const mdToday=()=>businessToday();
 const mdFmt=amount=>money(Number(amount)||0);
 const mdSafe=val=>esc(String(val??''));
 function mdCreateEntry(){
  return {id:'MDR'+crypto.randomUUID().replace(/-/g,''),date:mdToday(),amount:'',receiptRef:'',statementId:mdState?.docs?.[0]?.id||'',photo:null,preview:null,status:'',dateEdited:false,amountEdited:false,refEdited:false};
 }
 function mdStartSale(saleId){
  if(!cloudReady||cloudUser?.role!=='admin')return toast('Se requiere acceso de administrador para registrar abonos.','error');
  const sale=getSale(saleId),lot=getLot(sale?.lotId),client=getClient(sale?.clientId);
  if(!sale||!lot||!client||sale.type!=='credit'||balance(sale)<.01)return toast('Selecciona un solar con crédito y saldo pendiente.','error');
  if(cloudBlocked||cloudBusy||cloudQueue?.pending||cloudQueue?.latest!==cloudQueue?.confirmed)return toast('Sincroniza primero los cambios pendientes antes de registrar varios pagos.','error');
  mdState={kind:'sale',saleId:sale.id,clientId:client.id,residenceId:lot.residenceId,clientName:client.name,lotLabel:'Etapa '+(lot.stage||'—')+' · Bloque '+lot.block+' · Solar '+(lot.sourceNumber||lot.id),snapshot:JSON.stringify(db),rows:[],docs:[]};
  mdState.rows.push(mdCreateEntry());mdState.rows.push(mdCreateEntry());
  mdSaved=null;mdShow();
 }
 function mdStartOwner(clientId,rid){
  if(!cloudReady||cloudUser?.role!=='admin')return toast('Se requiere acceso de administrador para registrar abonos.','error');
  const client=getClient(clientId);if(!client)return toast('No se encontró el propietario.','error');
  const docs=(db.ownershipStatements||[]).filter(x=>x.clientId===clientId&&x.residenceId===rid&&!(x.contractIds||[]).some(id=>(db.historicalContracts||[]).find(c=>c.id===id)?.saleId));
  if(!docs.length){
   const sale=db.sales.find(x=>x.clientId===clientId&&getLot(x.lotId)?.residenceId===rid&&balance(x)>.009);
   if(sale)return mdStartSale(sale.id);
   return toast('No existen fichas de solares con saldo para registrar varios abonos.','error');
  }
  if(cloudBlocked||cloudBusy||cloudQueue?.pending||cloudQueue?.latest!==cloudQueue?.confirmed)return toast('Sincroniza primero los cambios pendientes antes de registrar varios pagos.','error');
  mdState={kind:'owner',clientId,residenceId:rid,clientName:client.name,lotLabel:'Fichas de propietario · '+docs.length+' documento(s)',docs,snapshot:JSON.stringify(db),rows:[]};
  mdState.rows.push(mdCreateEntry());mdState.rows.push(mdCreateEntry());
  mdSaved=null;mdShow();
 }
 function mdStartOwnerToken(token){
  const group=collectionGroupFromToken(token),rid=group.rid;
  if(!group.group||!rid)return toast('No se encontró la ficha del solar.','error');
  const clients=[...new Set(group.group.statements.map(s=>s.clientId).filter(Boolean))];
  if(clients.length===1)return mdStartOwner(clients[0],rid);
  if(clients.length<1)return toast('Este solar no tiene propietario confirmado.','error');
  showModal('Elegir propietario para varios abonos','<p>Confirma el propietario antes de registrar los recibos.</p>'+clients.map(id=>'<button type="button" class="btn btn-outline" data-md-pick-owner="'+mdSafe(id)+'" data-md-rid="'+mdSafe(rid)+'">'+mdSafe(getClient(id)?.name||id)+'</button>').join(''),'<button class="btn btn-soft" data-action="close-modal">Cancelar</button>',true);
 }
 function mdRowMarkup(row,index){
  const options=mdState.kind==='owner'?'<label class="md-lot-choice">Ficha / solares<select data-md-field="statementId" data-md-id="'+mdSafe(row.id)+'">'+mdState.docs.map(s=>'<option value="'+mdSafe(s.id)+'" '+(s.id===row.statementId?'selected':'')+'>'+mdSafe(s.sourceName||'Ficha')+' · '+mdSafe((s.references||[]).map(r=>'B '+r.block+' / S '+r.lot).join(', ')||'Solar por confirmar')+'</option>').join('')+'</select></label>':'';
  return '<article class="md-row" data-md-row="'+mdSafe(row.id)+'"><div class="md-row-top"><strong>▤ Abono '+(index+1)+'</strong><button type="button" class="md-trash" title="Eliminar este abono" aria-label="Eliminar abono '+(index+1)+'" data-md-remove="'+mdSafe(row.id)+'">♧</button></div>'+options+
   '<div class="md-fields"><label>Fecha *<input type="date" data-md-field="date" data-md-id="'+mdSafe(row.id)+'" value="'+mdSafe(row.date)+'" max="'+mdSafe(mdToday())+'" required></label>'+
   '<label>Monto (L) *<input type="number" inputmode="decimal" min=".01" step=".01" data-md-field="amount" data-md-id="'+mdSafe(row.id)+'" value="'+mdSafe(row.amount)+'" placeholder="0.00" required></label>'+
   '<label class="md-ref-label">Correlativo *<span class="md-ref-line"><span aria-hidden="true" class="md-ref-symbol">#</span><input type="text" inputmode="numeric" maxlength="80" pattern="[0-9]+" data-md-field="receiptRef" data-md-id="'+mdSafe(row.id)+'" value="'+mdSafe(row.receiptRef)+'" placeholder="00006159" required></span></label></div>'+
   '<div class="md-photo-row"><label class="md-scan-icon" title="Escanear o seleccionar foto" aria-label="Escanear recibo"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 3H5a2 2 0 0 0-2 2v2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="7" y="8" width="10" height="9" rx="2"/><circle cx="12" cy="12.5" r="1.7"/></svg><input type="file" accept="image/jpeg,image/png,image/webp" data-md-photo="'+mdSafe(row.id)+'" hidden></label>'+
   (row.preview?'<img src="'+mdSafe(row.preview)+'" class="md-photo-preview" alt="Recibo de este abono">':'')+
   '<span class="md-photo-status" data-md-photo-status="'+mdSafe(row.id)+'">'+mdSafe(row.status||(row.photo?'Recibo adjunto':'Foto opcional · escanea aquí'))+'</span></div>'+
   '<p class="md-ref-feedback" data-md-feedback="'+mdSafe(row.id)+'" role="status"></p></article>';
 }
 function mdShow(){
  const header='<div class="md-heading"><h3>¿Cómo deseas abonar?</h3><div class="md-choices"><button type="button" data-md-one>1 mes</button><button type="button" class="selected" aria-pressed="true" data-md-many>✓ Varios</button></div></div>'+
    '<p class="md-note">Cada fecha se guardará como un pago individual con su propio correlativo y recibo. Los ceros iniciales no cuentan para detectar repetidos.</p>'+
    '<p class="md-client">'+mdSafe(mdState.clientName)+'<small>'+mdSafe(mdState.lotLabel)+'</small></p>'+
    '<form id="md-abonos-form"><div id="md-abonos-list"></div><button type="button" class="btn btn-outline md-add" data-md-add>+ Agregar otra fecha</button>'+
    '<div class="md-total"><span><small>Total a registrar</small><strong data-md-total>L 0.00</strong></span><span><small>Recibos separados</small><strong data-md-count>2</strong></span></div><p class="md-error" data-md-error role="alert"></p></form>';
  showModal('Registrar Pago / Abono',header,'<button class="btn btn-outline" type="button" data-md-save>✓ Guardar abonos</button><button class="btn btn-soft" type="button" data-action="close-modal">Cancelar</button>',true);
  const modal=document.querySelector('#modal-root .modal');if(modal)modal.classList.add('lg-multi-date-modal','lg-payment-modern');
  mdRenderRows();
 }
 function mdRenderRows(){
  const list=document.getElementById('md-abonos-list');if(!list||!mdState)return;
  list.innerHTML=mdState.rows.map(mdRowMarkup).join('');
  mdRefresh();
 }
 function mdRefresh(){
  if(!mdState)return;
  const total=mdState.rows.reduce((acc,r)=>acc+(Number(r.amount)||0),0);
  const totalEl=document.querySelector('[data-md-total]'),count=document.querySelector('[data-md-count]');
  if(totalEl)totalEl.textContent=mdFmt(total);if(count)count.textContent=String(mdState.rows.length);
  const references=new Map();
  for(const r of mdState.rows){
   const key=window.lotigestOwnerPayments?.normalizeReceiptCorrelativo(r.receiptRef);
   if(key==null||!r.receiptRef.trim())continue;
   references.set(key,(references.get(key)||0)+1);
  }
  for(const r of mdState.rows){
   const ref=r.receiptRef.trim(),key=window.lotigestOwnerPayments?.normalizeReceiptCorrelativo(ref);
   const el=document.querySelector('[data-md-feedback="'+r.id+'"]');
   if(!el)continue;
   let warning='';
   if(ref&&key===null)warning='El correlativo debe contener solamente números.';
   else if(ref&&references.get(key)>1)warning='Correlativo '+key+' repetido entre estas fechas.';
   else if(ref&&window.lotigestOwnerPayments?.findReceiptCorrelativo(db,ref))warning='El correlativo '+key+' ya está registrado.';
   el.textContent=warning||(ref?'Se comprobará como '+key:'');
   el.classList.toggle('invalid',Boolean(warning));
   const row=document.querySelector('[data-md-row="'+r.id+'"]');row?.classList.toggle('md-duplicate',Boolean(warning));
  }
 }
 function mdUpdateField(input){
  const row=mdById(input.dataset.mdId);if(!row)return;
  const field=input.dataset.mdField;
  if(!['date','amount','receiptRef','statementId'].includes(field))return;
  row[field]=input.value;if(field==='date')row.dateEdited=true;if(field==='amount')row.amountEdited=true;if(field==='receiptRef')row.refEdited=true;
  mdRefresh();
 }
 function mdRemove(id){
  if(!mdState)return;
  if(mdState.rows.length<=1)return toast('Mantén al menos un abono.','error');
  const row=mdById(id);if(row?.preview)URL.revokeObjectURL(row.preview);
  mdState.rows=mdState.rows.filter(r=>r.id!==id);mdRenderRows();
 }
 function mdError(message){
  const el=document.querySelector('[data-md-error]');if(el)el.textContent=message;
  toast(message,'error');
 }
 async function mdPhotoChanged(input){
  const row=mdById(input.dataset.mdPhoto),file=input.files?.[0];if(!row||!file)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>12*1024*1024){
   input.value='';mdError('El recibo debe ser JPG, PNG o WebP de hasta 12 MB.');return;
  }
  if(row.preview)URL.revokeObjectURL(row.preview);
  row.photo=file;row.preview=URL.createObjectURL(file);row.status='Recibo cargado · leyendo OCR…';
  mdRenderRows();
  await mdOcr(row);
 }
 async function mdOcr(row){
  let bitmap=null,worker=null,canvas=null;
  try{
   if(typeof loadContractOcr!=='function'||!window.lotigestPaperReceipt)throw Error('La lectura automática no está disponible.');
   bitmap=await createImageBitmap(row.photo);
   const scale=Math.min(1,1900/Math.max(bitmap.width,bitmap.height));
   canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
   const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
   const T=await loadContractOcr();
   worker=await T.createWorker('spa',1,{workerPath:pagesContractOcr?contractOcrCdn+'worker.min.js':new URL('ocr/worker.min.js',location.href).href,corePath:pagesContractOcr?'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.0.0':new URL('ocr/core',location.href).href,langPath:pagesContractOcr?'https://tessdata.projectnaptha.com/4.0.0':new URL('ocr/lang',location.href).href});
   const parsed=window.lotigestPaperReceipt.extractPaperReceipt((await worker.recognize(canvas,{rotateAuto:true})).data.text||'');
   if(!mdState||!mdById(row.id))return;
   if(parsed.date&&!row.dateEdited&&parsed.date<=mdToday())row.date=parsed.date;
   if(parsed.amount!=null&&!row.amountEdited)row.amount=String(parsed.amount);
   if(parsed.reference&&!row.refEdited)row.receiptRef=String(parsed.reference);
   row.status='OCR leído · revisa fecha, monto y correlativo';
   mdRenderRows();
  }catch(e){
   if(mdById(row.id)){row.status='Recibo cargado · introduce o revisa datos manualmente';mdRenderRows();}
  }finally{bitmap?.close();if(worker)try{await worker.terminate();}catch{}if(canvas)canvas.width=canvas.height=1;}
 }
 function mdValidate(){
  if(!mdState||!mdState.rows.length)throw Error('Agrega al menos un abono.');
  if(!cloudReady||cloudUser?.role!=='admin'||cloudBlocked||cloudBusy||cloudQueue?.pending||cloudQueue?.latest!==cloudQueue?.confirmed)throw Error('Sincroniza la aplicación antes de registrar varios abonos.');
  if(JSON.stringify(db)!==mdState.snapshot)throw Error('Los datos cambiaron. Vuelve a abrir el formulario para evitar duplicaciones.');
  const existingKeys=new Set(),result=[];
  for(const [i,row] of mdState.rows.entries()){
   if(!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||!Number.isFinite(+new Date(row.date+'T12:00:00Z'))||new Date(row.date+'T12:00:00Z').toISOString().slice(0,10)!==row.date||row.date>mdToday())throw Error('Revisa la fecha del abono '+(i+1)+'. No puede ser futura.');
   const val=Number(row.amount),cents=Math.round(val*100);
   if(row.amount===''||!Number.isSafeInteger(cents)||cents<=0||Math.abs(cents-val*100)>.001)throw Error('Monto inválido en el abono '+(i+1)+'.');
   const raw=String(row.receiptRef||'').trim(),normalized=window.lotigestOwnerPayments.requireReceiptCorrelativo(raw);
   if(existingKeys.has(normalized)||window.lotigestOwnerPayments.findReceiptCorrelativo(db,raw))throw Error('El correlativo '+normalized+' ya está registrado o repetido.');
   existingKeys.add(normalized);
   if(mdState.kind==='owner'&&!mdState.docs.some(d=>d.id===row.statementId))throw Error('Selecciona una ficha válida en el abono '+(i+1)+'.');
   if(row.photo&&(!window.lotigestFiles||row.photo.size>12*1024*1024))throw Error('No se puede conservar la fotografía del abono '+(i+1)+'.');
   result.push({...row,amount:val,cents,raw,normalized,position:i});
  }
  return result.sort((a,b)=>a.date.localeCompare(b.date)||a.position-b.position);
 }
 async function mdSave(){
  if(mdSaving||!mdState)return;
  mdSaving=true;const btn=document.querySelector('[data-md-save]');if(btn)btn.disabled=true;
  try{
   const ordered=mdValidate();let next=JSON.parse(JSON.stringify(db)),saved=[],attachments=[];
   const sale=mdState.kind==='sale'?next.sales.find(s=>s.id===mdState.saleId):null;
   const lot=sale?next.lots.find(l=>l.id===sale.lotId):null;
   if(sale&&(!lot||sale.type!=='credit'))throw Error('El contrato o solar cambió.');
   let previousPaid=sale?(Number(sale.openingPaid)||0)+next.payments.filter(p=>p.saleId===sale.id).reduce((n,p)=>n+Number(p.amount||0),0):0;
   let remaining=sale?Math.round((Number(sale.price)-previousPaid)*100):null;
   for(const row of ordered){
    let id;
    const photoKey=row.photo?'AbonoFoto_'+crypto.randomUUID().replace(/-/g,''):null;
    if(mdState.kind==='sale'){
     if(row.date<sale.date)throw Error('La fecha '+row.date+' es anterior al contrato.');
     if(remaining<row.cents)throw Error('La suma de abonos supera el saldo pendiente del solar.');
     if(typeof assertMonthlyPayment==='function')assertMonthlyPayment(next,[lot.id],row.cents);
     const groupId=uid('RC');
     const payment={id:groupId+'-1',groupId,saleId:sale.id,date:row.date,amount:row.amount,concept:'Abono mensual · Registro por fechas',method:'Efectivo',receiptReference:row.raw,receiptReferenceNormalized:row.normalized,recordedAt:new Date().toISOString(),...(photoKey?{receiptImageKey:photoKey}:{}),verifyToken:Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('')};
     payment.receiptInfo=buildReceiptInfo(payment,previousPaid);
     next.payments.unshift(payment);previousPaid+=row.amount;remaining-=row.cents;id=payment.id;
    }else{
     const outcome=window.lotigestOwnerPayments.createOwnerPayment(next,{id:'OP-'+crypto.randomUUID(),clientId:mdState.clientId,residenceId:mdState.residenceId,date:row.date,method:'Efectivo',concept:'Abono mensual · Registro por fechas',receiptRef:row.raw,reviewed:true,allocations:[{statementId:row.statementId,referenceIndex:null,amount:row.amount}]});
     next=outcome.state;id=outcome.receipt.id;
     const receipt=next.ownerPayments.find(p=>p.id===id);if(photoKey)receipt.receiptImageKey=photoKey;
     receipt.verifyToken=Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
    }
    saved.push({id,kind:mdState.kind,ref:row.raw,date:row.date,amount:row.amount,photoKey});
    if(photoKey)attachments.push({key:photoKey,file:row.photo});
   }
   for(const {key,file} of attachments)await window.lotigestFiles.queue(key,file);
   cloudWrite(JSON.stringify(next));db=next;
   await cloudFlush();
   const confirmed=!!cloudQueue&&!cloudBlocked&&!cloudOffline&&!cloudQueue.pending&&cloudQueue.latest===cloudQueue.confirmed;
   mdSaved={items:saved,confirmed,client:mdState.clientName};
   for(const row of mdState.rows)if(row.preview)URL.revokeObjectURL(row.preview);
   mdState=null;mdShowSaved();
   if(!confirmed)toast('Los abonos quedaron en este dispositivo pendientes de sincronización. No compartas comprobantes hasta confirmar el guardado en Cloudflare.','error');
   else toast(saved.length+' abonos individuales guardados en Cloudflare.');
  }catch(e){mdError(e.message||'No se pudieron guardar los abonos.');}
  finally{mdSaving=false;if(btn?.isConnected)btn.disabled=false;}
 }
 function mdShowSaved(){
  if(!mdSaved)return;
  const confirmed=mdSaved.confirmed;
  const body='<div class="md-success"><h3>'+(confirmed?'✓ Pagos guardados por separado':'Pagos pendientes de sincronización')+'</h3><p>'+mdSafe(mdSaved.client)+' · '+mdSaved.items.length+' recibo(s) individuales</p>'+
   (confirmed?'<p>Ya puedes descargarlos por separado o generar un solo PDF con todas las fechas para compartirlo.</p>':'<p>Se conservó una copia local. Verifica la sincronización de Cloudflare antes de enviar los recibos.</p>')+'</div>'+
   '<div class="md-saved-list">'+mdSaved.items.map((p,i)=>'<div class="md-saved-item"><span>Abono '+(i+1)+' · '+mdSafe(p.date)+' · '+mdFmt(p.amount)+'<small>Correlativo '+mdSafe(p.ref)+'</small></span><span class="md-saved-actions">'+(confirmed?'<button type="button" data-md-pdf="'+mdSafe(p.id)+'" data-md-kind="'+mdSafe(p.kind)+'">PDF</button>':'')+(p.photoKey?'<button type="button" data-md-view-photo="'+mdSafe(p.photoKey)+'">Foto</button>':'')+'</span></div>').join('')+'</div>';
  const footer=confirmed?'<button class="btn btn-outline" type="button" data-md-download-all>Descargar todos (PDF)</button><button class="btn btn-primary" type="button" data-md-share-all>Enviar todos</button><button class="btn btn-soft" type="button" data-action="close-modal">Cerrar</button>':'<button class="btn btn-soft" type="button" data-action="close-modal">Cerrar</button>';
  showModal('Abonos · Recibos separados',body,footer,true);
  document.querySelector('#modal-root .modal')?.classList.add('lg-multi-date-modal','lg-payment-modern');
 }
 function mdCombinedPdf(){
  if(!mdSaved?.confirmed)throw Error('Confirma el guardado en Cloudflare antes de compartir recibos.');
  const parts=[],items=mdSaved.items;
  for(const [i,item] of items.entries()){
   const p=item.kind==='owner'?(db.ownerPayments||[]).find(p=>p.id===item.id):db.payments.find(p=>p.id===item.id);
   if(!p)throw Error('Un recibo ya no está en la sesión. Actualiza los datos.');
   if(i)parts.push({pageBreak:true});
   parts.push({text:'RECIBO INDIVIDUAL '+(i+1)+' DE '+items.length,size:16,bold:true});
   parts.push({text:'Correlativo de caja: '+p.receiptReference,size:12,bold:true});
   parts.push({text:'Fecha: '+fmtDate(p.date)});
   if(item.kind==='owner'){
    parts.push({text:'Cliente: '+p.clientName});
    parts.push({text:'Residencial: '+p.residenceName});
    for(const a of p.allocations||[])parts.push({text:(a.references||[]).map(r=>'Bloque '+r.block+' · Solar '+r.solar).join(', ')});
    parts.push({text:'TOTAL RECIBIDO: '+mdFmt(p.amountCents/100),size:15,bold:true,gap:16});
   }else{
    const info=receiptInfo(p);
    parts.push({text:'Cliente: '+info.clientName});
    parts.push({text:'Residencial: '+info.residence+' · Bloque '+info.block+' · Solar '+info.solar});
    for(const a of info.allocations||[])parts.push({text:a.label+' · '+mdFmt(a.amount)});
    parts.push({text:'Deuda anterior: '+mdFmt(info.before)});
    parts.push({text:'TOTAL RECIBIDO: '+mdFmt(p.amount),size:15,bold:true,gap:16});
    parts.push({text:'DEUDA PENDIENTE: '+mdFmt(info.after),bold:true});
   }
   parts.push({text:'Recibo independiente. Para verificar el código QR, consulta su PDF individual.',size:9});
  }
  return {blob:receiptLetterPdf(parts,db.company.name||'GRUPO H','VARIOS-'+items.length),name:'LOTIGEST_PRO_'+items.length+'_recibos.pdf'};
 }
 async function mdShareAll(share){
  try{
   const {blob,name}=mdCombinedPdf(),file=new File([blob],name,{type:'application/pdf'});
   if(share&&navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'Recibos LOTIGEST PRO'});return;}
   download(name,blob,'application/pdf');
   toast(share?'PDF descargado. Selecciona WhatsApp y adjúntalo al chat del cliente.':'Todos los recibos descargados en un solo PDF.');
  }catch(e){if(e.name!=='AbortError')toast(e.message||'No se pudieron generar los recibos.','error');}
 }
 async function mdViewPhoto(key){
  try{
   let image=await window.lotigestFiles?.get(key);
   if(!image){const res=await fetch('/api/app/file?'+new URLSearchParams({key}),{credentials:'same-origin',cache:'no-store'});if(!res.ok)throw Error('El archivo aún no está disponible en la nube.');image=await res.blob();}
   const url=URL.createObjectURL(image),link=document.createElement('a');
   link.href=url;link.target='_blank';link.rel='noopener noreferrer';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }catch(e){toast(e.message||'No se pudo abrir la foto.','error');}
 }
 document.addEventListener('click',event=>{
  const action=event.target.closest?.('[data-md-start-sale],[data-md-start-owner],[data-md-pick-owner],[data-md-add],[data-md-remove],[data-md-one],[data-md-many],[data-md-save],[data-md-pdf],[data-md-download-all],[data-md-share-all],[data-md-view-photo]');
  if(!action)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(action.hasAttribute('data-md-start-sale'))mdStartSale(action.dataset.mdStartSale);
  else if(action.hasAttribute('data-md-start-owner'))mdStartOwnerToken(action.dataset.mdStartOwner);
  else if(action.hasAttribute('data-md-pick-owner'))mdStartOwner(action.dataset.mdPickOwner,action.dataset.mdRid);
  else if(action.hasAttribute('data-md-add')){if(mdState.rows.length>=24)return mdError('Se admiten como máximo 24 recibos por operación.');mdState.rows.push(mdCreateEntry());mdRenderRows();}
  else if(action.hasAttribute('data-md-remove'))mdRemove(action.dataset.mdRemove);
  else if(action.hasAttribute('data-md-one')){if(mdState?.kind==='sale'){const id=mdState.saleId;mdState=null;baseNewPayment(id,false);}else if(mdState?.kind==='owner'){const {clientId,residenceId}=mdState;mdState=null;openOwnerAbono(clientId,residenceId);}}
  else if(action.hasAttribute('data-md-save'))mdSave();
  else if(action.hasAttribute('data-md-pdf')){if(action.dataset.mdKind==='owner')deliverOwnerPayment(action.dataset.mdPdf,false);else deliverPaymentReceipt(action.dataset.mdPdf,false);}
  else if(action.hasAttribute('data-md-download-all'))mdShareAll(false);
  else if(action.hasAttribute('data-md-share-all'))mdShareAll(true);
  else if(action.hasAttribute('data-md-view-photo'))mdViewPhoto(action.dataset.mdViewPhoto);
 },true);
 document.addEventListener('input',event=>{if(event.target.closest?.('#md-abonos-form')&&event.target.matches('[data-md-field]'))mdUpdateField(event.target);},true);
 document.addEventListener('change',event=>{
  if(!event.target.closest?.('#md-abonos-form'))return;
  if(event.target.matches('[data-md-photo]'))mdPhotoChanged(event.target);
  else if(event.target.matches('[data-md-field]'))mdUpdateField(event.target);
 },true);
 document.addEventListener('submit',event=>{if(event.target.id==='md-abonos-form'){event.preventDefault();event.stopImmediatePropagation();mdSave();}},true);
})();
