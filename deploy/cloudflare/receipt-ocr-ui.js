// Reutiliza el OCR local existente del navegador; nunca guarda fotografías automáticamente.
function receiptOcrWidget(){
 return `<fieldset class="card" style="padding:12px;margin:14px 0"><legend>Escanear recibo de caja · Grupo H (OCR)</legend>
 <p class="sm">Formato rosado: «Por Lps.», día/mes/año, «Recibí de» y número de recibo. <strong>Saldo anterior y saldo actual NO se registran como abono.</strong></p>
 <div style="display:flex;flex-wrap:wrap;gap:8px"><label class="btn btn-outline">Tomar foto<input data-paper-ocr-photo type="file" accept="image/*" capture="environment" hidden></label>
 <label class="btn btn-outline">Elegir foto<input data-paper-ocr-photo type="file" accept="image/jpeg,image/png,image/webp" hidden></label></div>
 <p data-paper-ocr-status role="status">El OCR se procesa en este dispositivo. Requiere revisión antes de registrar; no se almacena la imagen.</p>
 <img data-paper-ocr-preview alt="Vista previa del recibo fotografiado" style="max-width:100%;max-height:230px;object-fit:contain" hidden>
 <label data-paper-ocr-label hidden>Texto detectado (puedes corregirlo)<textarea data-paper-ocr-text rows="5" style="width:100%"></textarea></label>
 <button type="button" data-paper-ocr-apply class="btn btn-outline" hidden>Usar datos leídos para rellenar</button>
 <div data-paper-ocr-result role="status"></div>
 </fieldset>`;
}
function receiptMethodField(){
 return `<label>Método de pago<select name="method" required><option value="Efectivo" selected>Efectivo</option><option value="Transferencia">Transferencia</option><option value="Tarjeta">Tarjeta</option></select></label>`;
}
function receiptReferenceField(){
 return `<label class="pm-correlativo-field pm-span-2"><span class="pm-correlativo-label">Correlativo de pago *</span><span class="pm-correlativo-control"><span class="pm-correlativo-hash" aria-hidden="true">#</span><input name="receiptRef" inputmode="numeric" pattern="[0-9]+" maxlength="80" autocomplete="off" placeholder="Ej. 00006159" required aria-describedby="pm-correlativo-help"><span class="pm-correlativo-check" aria-hidden="true">✓</span></span><small id="pm-correlativo-help" class="pm-correlativo-help">Correlativo único del recibo de caja. Los ceros a la izquierda no se toman en cuenta.</small><small data-correlativo-message class="pm-correlativo-message" role="alert" aria-live="polite"></small></label>`;
}
const legacyBaseNewPayment=baseNewPayment;
baseNewPayment=function(saleId,useOcr=false){
 const result=legacyBaseNewPayment(saleId,useOcr),form=$('#multi-payment-form');
 if(!form)return result;
 const old=form.elements.method;
 if(old){const slot=document.createElement('span');slot.innerHTML=receiptMethodField();old.closest('label')?.replaceWith(slot.firstElementChild);}
 if(!form.elements.receiptRef){
  const ref=document.createElement('div');ref.innerHTML=receiptReferenceField();
  const slot=form.querySelector('#pm-amount-slot');
  if(slot)slot.after(ref.firstElementChild);
  else form.querySelector('.form-grid')?.append(ref.firstElementChild);
 }
 // El modal de ventas se crea antes de añadir el campo: conservarlo al lado del monto.
 const amountSlot=form.querySelector('#pm-amount-slot'),referenceField=form.elements.receiptRef?.closest('label');
 if(amountSlot&&referenceField)amountSlot.after(referenceField);
 if(useOcr)form.querySelector('#payment-ocr-photo')?.closest('fieldset')?.remove();
 if(!form.querySelector('[data-paper-ocr-photo]')){
  const block=document.createElement('div');block.innerHTML=receiptOcrWidget();
  form.prepend(block.firstElementChild);
 }
 // La decoración del modal ocurrió antes de agregar el OCR: instalar el icono
 // inferior ahora, cuando el fieldset y los botones ya existen.
 if(typeof pmEnsureOcrFooter==='function')pmEnsureOcrFooter(form);
 return result;
};
// El campo rojo valida al escribir; el guardado también se revisa en Cloudflare.
function receiptCorrelativoFeedback(input){
 if(!input||!input.closest('#multi-payment-form,#owner-abono-form,#manual-history-form'))return;
 const raw=input.value.trim(),label=input.closest('.pm-correlativo-field')||input.closest('label');
 const message=label?.querySelector('[data-correlativo-message]');
 const api=window.lotigestOwnerPayments;
 let error='',normalized=api?.normalizeReceiptCorrelativo(raw);
 if(!raw)error='Debes ingresar el correlativo del pago.';
 else if(raw.length>80||normalized===null)error='El correlativo debe contener solamente números.';
 else if(typeof db!=='undefined'&&api?.findReceiptCorrelativo(db,raw))
  error=api.receiptCorrelativoMessage(db,raw);
 if(input.setCustomValidity)input.setCustomValidity(error);
 input.setAttribute('aria-invalid',String(Boolean(error)));
 if(label){label.classList.toggle('pm-correlativo-duplicate',Boolean(error));label.classList.toggle('pm-correlativo-valid',Boolean(raw&&!error));}
 if(message)message.textContent=error||(raw&&normalized!==null?'Correlativo para validar: '+normalized:'');
}
document.addEventListener('input',event=>{
 if(event.target.matches?.('[name="receiptRef"]'))receiptCorrelativoFeedback(event.target);
});
document.addEventListener('change',event=>{
 if(event.target.matches?.('[name="receiptRef"]'))receiptCorrelativoFeedback(event.target);
});
function receiptOcrStatus(form,message){
 const el=form?.querySelector('[data-paper-ocr-status]');if(el)el.textContent=message;
}
async function receiptReadImage(input){
 const form=input.closest('form'),file=input.files?.[0];input.value='';
 if(!form||!file)return;
 const status=form.querySelector('[data-paper-ocr-status]'),preview=form.querySelector('[data-paper-ocr-preview]'),label=form.querySelector('[data-paper-ocr-label]'),apply=form.querySelector('[data-paper-ocr-apply]'),textbox=form.querySelector('[data-paper-ocr-text]'),result=form.querySelector('[data-paper-ocr-result]');
 if(form.dataset.paperOcrBusy==='yes')return;
 form.dataset.paperOcrBusy='yes';form.querySelectorAll('[data-paper-ocr-photo]').forEach(i=>i.disabled=true);
 if(preview)preview.hidden=true;if(label)label.hidden=true;if(apply)apply.hidden=true;
 if(result)result.textContent='';if(textbox)textbox.value='';
 let bitmap,canvas,worker;
 try{
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20*1024*1024)throw Error('La foto debe ser JPG, PNG o WebP y no superar 20 MB.');
  receiptOcrStatus(form,'Preparando imagen para lectura…');
  bitmap=await createImageBitmap(file);
  if(!form.isConnected)return;
  const scale=Math.min(1,2400/Math.max(bitmap.width,bitmap.height));
  canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
  if(preview){preview.src=canvas.toDataURL('image/jpeg',.8);preview.hidden=false;}
  receiptOcrStatus(form,'Cargando OCR de español…');
  const T=await loadContractOcr();
  if(!form.isConnected)return;
  const root=new URL('ocr/',location.href).href;
  worker=await T.createWorker('spa',1,{
    workerPath:pagesContractOcr?contractOcrCdn+'worker.min.js':root+'worker.min.js',
    corePath:pagesContractOcr?'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.0.0':root+'core',
    langPath:pagesContractOcr?'https://tessdata.projectnaptha.com/4.0.0':root+'lang'
  });
  if(!form.isConnected)return;
  receiptOcrStatus(form,'Leyendo el texto del recibo…');
  const {data}=await worker.recognize(canvas,{rotateAuto:true});
  if(!form.isConnected)return;
  if(!data.text?.trim())throw Error('La foto no tiene texto legible. Enfoca el recibo completo, endereza la imagen e intenta de nuevo.');
  textbox.value=data.text.trim();label.hidden=apply.hidden=false;
  receiptOcrStatus(form,'Texto detectado. Revísalo y pulsa «Usar datos leídos para rellenar».');
 }catch(e){if(form.isConnected)receiptOcrStatus(form,e.message||'No se pudo leer la foto. Introduce el pago manualmente.');}
 finally{bitmap?.close();if(canvas)canvas.width=canvas.height=1;if(worker)await worker.terminate().catch(()=>{});form.dataset.paperOcrBusy='';form.querySelectorAll('[data-paper-ocr-photo]').forEach(i=>i.disabled=false);}
}
function receiptApplyOcr(button){
 const form=button.closest('form');if(!form||form.dataset.paperOcrBusy==='yes')return;
 const parser=window.lotigestPaperReceipt;
 if(!parser){receiptOcrStatus(form,'No se pudo cargar el lector de recibos. Escribe los datos manualmente.');return;}
 const fields=parser.extractPaperReceipt(form.querySelector('[data-paper-ocr-text]')?.value||''),notes=[...fields.warnings];
 const namedClient=form.id==='manual-history-form'?getClient(form.dataset.ownerClientId):form.id==='owner-abono-form'?getClient(ownerPaymentDraft?.clientId):form.id==='multi-payment-form'?getClient(paymentDraft?.clientId):null;
 const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
 if(fields.name&&namedClient&&normalize(fields.name)!==normalize(namedClient.name))notes.push('Nombre leído: '+fields.name+'. Confirma que el recibo pertenece a '+namedClient.name+'. No se cambia el propietario automáticamente.');
 if(form.elements.date){
  form.elements.date.value=fields.date&&fields.date<=businessToday()?fields.date:'';
  if(fields.date&&fields.date>businessToday())notes.push('La fecha leída es futura y debe corregirse.');
 }
 if(form.elements.receiptRef&&fields.reference){form.elements.receiptRef.value=fields.reference;form.elements.receiptRef.dispatchEvent(new Event('input',{bubbles:true}));}
 if(fields.amount!=null){
  if(form.id==='manual-history-form'){form.elements.amount.value=String(fields.amount);form.elements.amount.dispatchEvent(new Event('input',{bubbles:true}));}
  else if(form.id==='owner-abono-form'){
   const inputs=[...form.querySelectorAll('[data-owner-statement]')];
   if(inputs.length===1){inputs[0].value=String(fields.amount);inputs[0].dispatchEvent(new Event('input',{bubbles:true}));}
   else notes.push('El pago puede cubrir varios solares o fichas. Distribuye manualmente L '+fields.amount.toFixed(2)+'; no se reparte automáticamente.');
  }else if(form.id==='multi-payment-form'){
   const ids=Object.keys(paymentDraft?.amounts||{});
   if(ids.length===1&&fields.amount<=balance(getSale(ids[0]))){
     paymentDraft.amounts[ids[0]]=String(fields.amount);renderPaymentSelected();
   }else notes.push('Selecciona un único solar con saldo suficiente y asigna el importe manualmente.');
  }
 }
 const summary=['OCR: '+(fields.amount!=null?'Abono L '+fields.amount.toFixed(2):'monto pendiente'),'Fecha: '+(fields.date||'por confirmar'),'Recibo: '+(fields.reference||'por confirmar'),...notes];
 const el=form.querySelector('[data-paper-ocr-result]');if(el){el.replaceChildren(...summary.map((message,i)=>{const p=document.createElement('p');p.textContent=message;p.style.margin='5px 0';if(i>=3)p.style.color='#a56c21';return p;}));}
 receiptOcrStatus(form,'Revisa propietario, solar, fecha, monto, método de pago y folio antes de guardar. El OCR nunca registra por sí solo.');
}
document.addEventListener('change',e=>{if(e.target.matches?.('[data-paper-ocr-photo]'))receiptReadImage(e.target);});
document.addEventListener('click',e=>{const button=e.target.closest?.('[data-paper-ocr-apply]');if(button){e.preventDefault();receiptApplyOcr(button);}});
