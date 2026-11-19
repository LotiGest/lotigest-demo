// LOTIGEST · Contratos primero: del documento a la ficha del cliente.
// Nunca convierte "prima pactada" en un pago recibido. OCR y validación son revisables.
let contractIntakeWorking=null;
function contractIntakeAdmin(){
 return cloudReady&&cloudUser?.role==='admin'&&sessionStorage.getItem(SESSION)==='yes'&&navigator.onLine!==false&&!cloudBusy&&!cloudBlocked&&!cloudQueue?.pending&&cloudQueue?.latest===cloudQueue?.confirmed;
}
function contractIntakeFormatMoney(n){return Number(n||0).toLocaleString('es-HN',{minimumFractionDigits:2,maximumFractionDigits:2});}
function contractIntakeFields(){
 const c=contractIntakeWorking?.values||{};
 const input=(label,key,type='text',readonly=false)=>'<label class="field-group"><span>'+esc(label)+'</span><input name="'+key+'" type="'+type+'" '+(type==='number'?'step="'+(key==='months'?'1':'any')+'" min="0" ':'')+(readonly?'readonly ':'')+'value="'+esc(c[key]??'')+'" style="width:100%;min-width:0"></label>';
 const rows=residenceLots().filter(l=>l.type!=='private'&&l.status!=='private').sort((a,b)=>(Number(a.stage||0)-Number(b.stage||0))||String(a.block||'').localeCompare(String(b.block||''),'es')||String(a.sourceNumber||a.id).localeCompare(String(b.sourceNumber||b.id),'es'));
 const matched=rows.filter(l=>!db.sales.some(s=>s.lotId===l.id)&&String(l.block||'').toUpperCase()===String(c.block||'').toUpperCase()&&String(l.sourceNumber||'').trim()===String(c.number||'').trim()&&(!c.stage||Number(l.stage)===Number(c.stage)));
 const selectedId=matched.length===1?matched[0].id:'';
 const pick='<label class="field-group full"><span>Solar del inventario (obligatorio; comprobar etapa)</span><select name="lotId" required><option value="">Selecciona etapa, bloque y solar</option>'+
 rows.map(l=>'<option value="'+esc(l.id)+'" '+(l.id===selectedId?'selected':'')+' '+(db.sales.some(s=>s.lotId===l.id)?'disabled':'')+'>Etapa '+esc(l.stage||'SIN DEFINIR')+' · Bloque '+esc(l.block||'—')+' · Solar '+esc(l.sourceNumber||l.id)+' · '+esc(l.area||'sin medida')+' m²'+(db.sales.some(s=>s.lotId===l.id)?' · CON VENTA':'')+'</option>').join('')+'</select></label>';
 const labels=[
  ['Nombre completo','name'],['Identidad / DNI','identity'],['RTN (opcional)','rtn'],['Estado civil','maritalStatus'],
  ['Profesión u oficio','occupation'],['Dirección','address'],['Bloque leído','block'],['Solar leído','number'],
  ['Área del documento (varas²)','areaVaras','number'],['Área del documento (m²)','areaM2','number'],
  ['Norte','north'],['Sur','south'],['Este','east'],['Oeste','west'],
  ['Precio total del lote (L)','price','number'],['Prima pactada (L)','down','number'],
  ['Saldo a financiar (L)','financed','number'],['Cuota del documento (L)','monthly','number'],
  ['Plazo (meses)','months','number'],['Precio por vara² (L)','pricePerVara','number']
 ];
 const fields=labels.map(([label,key,type])=>input(label,key,type)).join('');
 const areaWarnings=matched.length===1&&Number(matched[0].area)>0&&Number(c.areaM2)>0&&Math.abs(Number(matched[0].area)-Number(c.areaM2))>.02?
 '<p style="color:#965a18"><strong>Medidas distintas:</strong> inventario '+esc(matched[0].area)+' m², documento '+esc(c.areaM2)+' m². Se conservará la medida original; revisa la discrepancia.</p>':'';
 const warning=(matched.length>1?'<p style="color:#a35a1b">Hay varios solares con el mismo bloque y número: verifica la etapa.</p>':!matched.length?'<p style="color:#a35a1b">No se encontró una coincidencia única: comprueba etapa, bloque y solar. No se creará ningún terreno automáticamente.</p>':'')+areaWarnings;
 return '<form id="contract-intake-form"><p class="sm muted">El documento debe revisarse antes de confirmar. No reemplazamos medidas existentes, ventas o abonos. La etapa no se supone si no aparece en la imagen.</p>'+warning+
  '<div class="form-grid">'+pick+fields+'</div>'+
  '<label>Observaciones del documento<textarea name="observations" rows="4" style="width:100%">'+esc(c.observations||'')+'</textarea></label>'+
  '<details><summary>Ver/corregir texto reconocido completo</summary><textarea name="rawText" rows="9" style="width:100%">'+esc(c.rawText||'')+'</textarea></details>'+
  '<div id="contract-intake-alert" role="alert"></div>'+
  '<p class="sm muted">Guardar ficha crea el cliente y su documento vinculado, NO registra la prima cobrada ni genera cuotas. Para registrar la venta necesitarás fecha de contrato y primer vencimiento; después podrás ingresar los abonos desde el módulo normal.</p></form>';
}
function contractIntakeOpen(){
 if(!contractIntakeAdmin()){toast('Solo el administrador, con datos sincronizados y conexión, puede registrar contratos.','error');return;}
 contractIntakeWorking={residenceId:residence().id,file:null,values:{},readVersion:0,busy:false};
 showModal('Registrar cliente desde contrato','<p>Primer paso: sube una foto legible del documento de compra de esta residencial.</p>'+
 '<label class="field-group"><span>Imagen del contrato</span><input id="contract-intake-file" type="file" accept="image/jpeg,image/png,image/webp"></label>'+
 '<p class="sm muted">El OCR se realiza en tu dispositivo. Luego podrás revisar los datos antes de guardar; la imagen original se almacena de forma privada en LOTIGEST al confirmar.</p>'+
 '<div id="contract-intake-status" role="status"></div><div id="contract-intake-review"></div>',
 '<button type="button" class="btn btn-outline" data-action="close-modal">Cancelar</button><button type="submit" id="contract-intake-save" form="contract-intake-form" class="btn btn-primary" disabled>Guardar ficha revisada</button>',true,'Contratos → Cliente → Solar → Abonos');
}
async function contractIntakeRead(file){
 const scan=contractIntakeWorking,status=document.getElementById('contract-intake-status'),box=document.getElementById('contract-intake-review'),saveBtn=document.getElementById('contract-intake-save');
 if(!scan||!file||!status||!box)return;
 const version=++scan.readVersion;
 if(file.size>12*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type)){
  status.textContent='Usa una imagen JPG, PNG o WebP de hasta 12 MB.';return;
 }
 scan.busy=true;saveBtn.disabled=true;scan.file=file;
 let bmp=null,worker=null,canvas=null;
 try{
  status.textContent='Preparando imagen y leyendo el documento…';
  bmp=await createImageBitmap(file);
  canvas=document.createElement('canvas');
  const factor=Math.min(1,2200/Math.max(bmp.width,bmp.height));
  canvas.width=Math.max(1,Math.round(bmp.width*factor));canvas.height=Math.max(1,Math.round(bmp.height*factor));
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bmp,0,0);bmp.close();bmp=null;
  const T=await loadContractOcr();
  worker=await T.createWorker('spa',1,{logger:m=>{if(scan===contractIntakeWorking&&status.isConnected&&m.status==='recognizing text')status.textContent='Reconociendo texto: '+Math.round((m.progress||0)*100)+'%';}});
  const {data}=await worker.recognize(canvas,{rotateAuto:true});
  if(scan!==contractIntakeWorking||version!==scan.readVersion)return;
  scan.values=parseContractIntake(data.text||'');scan.values._confidence=Math.round(data.confidence||0);
  box.innerHTML=contractIntakeFields();
  saveBtn.disabled=false;
  status.textContent='Lectura lista (calidad aproximada '+scan.values._confidence+'%). Revisa cada campo, especialmente DNI, etapa, colindancias y precio.';
 }catch(e){
  if(scan!==contractIntakeWorking)return;
  scan.values={};
  box.innerHTML=contractIntakeFields();
  saveBtn.disabled=false;
  status.textContent='No fue posible leer automáticamente la foto. Puedes escribir los datos manualmente y revisarlos antes de guardar.';
 }finally{
  if(bmp)bmp.close();if(worker)await worker.terminate().catch(()=>{});if(canvas){canvas.width=1;canvas.height=1;}
  if(scan===contractIntakeWorking)scan.busy=false;
 }
}
function contractIntakeData(form){
 const values=Object.fromEntries(new FormData(form));
 for(const key of ['areaVaras','areaM2','price','down','financed','monthly','months','pricePerVara']){
  values[key]=values[key]===''?null:Number(values[key]);
 }
 return values;
}
function contractIntakeFindClient(state,data){
 const identity=normalizeClientLookup(data.identity);
 const matches=state.clients.filter(c=>normalizeClientLookup(c.identity)===identity);
 if(matches.length>1)throw Error('Hay identidades duplicadas. Revisa Clientes.');
 if(matches.length&&normalizeClientLookup(matches[0].name)!==normalizeClientLookup(data.name))
  throw Error('La identidad ya figura bajo otro nombre. Revisa el documento.');
 if(matches.length)return matches[0];
 const client={id:'C-'+crypto.randomUUID(),name:String(data.name).trim().toUpperCase(),identity:String(data.identity).trim(),
   phone:'',address:String(data.address||'').trim(),email:'',rtn:String(data.rtn||'').trim(),maritalStatus:String(data.maritalStatus||'').trim(),occupation:String(data.occupation||'').trim()};
 state.clients.unshift(client);return client;
}
async function contractIntakeStorePhoto(file){
 const key='contrato_'+crypto.randomUUID().replace(/-/g,'');
 const response=await fetch('/api/app/file?key='+encodeURIComponent(key),{
  method:'PUT',credentials:'same-origin',headers:{'Content-Type':file.type},body:file
 });
 let body={};
 try{body=await response.json();}catch{}
 if(!response.ok)throw Error(body.error||'No se pudo guardar la fotografía original del contrato.');
 return body.key||key;
}
async function contractIntakeSave(form){
 const original=contractIntakeWorking,alert=document.getElementById('contract-intake-alert'),button=document.getElementById('contract-intake-save');
 if(!original||!form||original.busy||!contractIntakeAdmin())throw Error('La sesión está ocupada o sin autorización.');
 const data=contractIntakeData(form),lot=getLot(data.lotId);
 if(!original.file)throw Error('Debes subir primero la foto del documento original.');
 if(original.residenceId!==residence().id||!lot||lot.residenceId!==original.residenceId)throw Error('El solar debe pertenecer a la residencial seleccionada.');
 const issues=intakeCheckValues(data,lot);if(issues.length)throw Error(issues.join(' '));
 if(db.sales.some(s=>s.lotId===lot.id))throw Error('Ese solar ya tiene una venta. No se puede asignar otro comprador.');
 if(activeReservation(lot.id))throw Error('El solar tiene un apartado vigente que debes revisar.');
 if((db.contractTexts||[]).some(d=>d.lotId===lot.id&&d.status!=='voided'))throw Error('Ya existe un documento asociado a este solar; revísalo antes de cargar otro.');
 const price=Number(data.price),down=Number(data.down),months=Number(data.months);
 if(Number(data.financed)!=null&&data.financed!==null&&Math.abs(Number(data.financed)-(price-down))>.06)throw Error('El saldo del documento no coincide con precio menos prima.');
 const expected=Math.round((price-down)/months*100)/100;
 if(data.monthly!=null&&Math.abs(data.monthly-expected)>.03)throw Error('La cuota reconocida no coincide con la amortización a 0 %. Verifica OCR y plazo.');
 if(button)button.disabled=true;original.busy=true;
 try{
  const snapshot=JSON.stringify(db);
  const key=await contractIntakeStorePhoto(original.file);
  if(!contractIntakeAdmin()||contractIntakeWorking!==original||snapshot!==JSON.stringify(db))throw Error('El inventario cambió. Vuelve a revisar el contrato.');
  const next=JSON.parse(snapshot),target=next.lots.find(l=>l.id===lot.id);
  const client=contractIntakeFindClient(next,data);
  const now=new Date().toISOString();
  const {rawText:sourceOCR,...structuredFields}=data;
  const record={id:'OCR-'+crypto.randomUUID(),clientId:client.id,lotId:lot.id,saleId:'',residenceId:original.residenceId,
   title:'FICHA CONTRACTUAL DE '+String(client.name).slice(0,85),pages:[{number:1,text:String(data.rawText||'').slice(0,50000),confidence:original.values._confidence??null}],
   structured:{...structuredFields,lotId:lot.id,stage:lot.stage??null,monthlyCalculated:expected,downPaymentReceived:false},
   documentKey:key,documentMime:original.file.type,format:'photo+ocr',status:'pending-sale',createdAt:now,updatedAt:now};
  next.contractTexts??=[];next.contractTexts.unshift(record);
  // Solo completar vacíos del inventario; jamás sobrescribir medidas existentes.
  if(!(Number(target.area)>0)&&Number(data.areaM2)>0){target.area=Number(data.areaM2);target.areaMode='manual';target.areaOrigin='contract-reviewed';}
  if(!(Number(target.areaVaras2)>0)&&Number(data.areaVaras)>0)target.areaVaras2=Number(data.areaVaras);
  if(!(Number(target.price)>0))target.price=price;
  // El estado de venta sólo se actualizará al activar el crédito.
  cloudWrite(JSON.stringify(next));db=next;
  await cloudFlush();
  if(cloudBlocked||cloudOffline||cloudQueue?.latest!==cloudQueue?.confirmed){
   toast('La ficha se conserva pendiente de sincronizar. Comprueba el indicador de nube antes de ingresar otro contrato.','error');
  }else toast('Ficha contractual guardada. Ahora puedes activar la venta con sus fechas y luego registrar abonos.');
  contractIntakeWorking=null;closeModal();render();
 }finally{original.busy=false;if(button?.isConnected)button.disabled=false;}
}
function contractIntakeActivate(id){
 if(!contractIntakeAdmin()){toast('Debes tener sesión de administrador y datos sincronizados.','error');return;}
 const d=(db.contractTexts||[]).find(x=>x.id===id&&x.status==='pending-sale');
 if(!d)return;
 showModal('Activar crédito desde contrato',
  '<p><b>'+esc(getClient(d.clientId)?.name||'Cliente')+'</b> · Etapa '+esc(getLot(d.lotId)?.stage||'sin confirmar')+' · Bloque '+esc(getLot(d.lotId)?.block||'')+' · Solar '+esc(getLot(d.lotId)?.sourceNumber||'')+'</p>'+
  '<p>Precio '+money(d.structured.price)+' · Prima pactada '+money(d.structured.down)+' · '+esc(d.structured.months)+' cuotas. <strong>Prima recibida: L 0.00</strong>; deberás registrarla después desde Abonos.</p>'+
  '<form id="contract-intake-activate-form"><input type="hidden" name="documentId" value="'+esc(id)+'">'+
  '<label>Fecha de contrato<input name="date" type="date" required></label>'+
  '<label>Fecha primera cuota<input name="firstDueDate" type="date" required></label>'+
  '<p class="sm muted">Estos datos no aparecen en la imagen y no pueden inventarse. Al activar, el sistema reconocerá la deuda y el calendario, pero no un pago.</p></form>',
  '<button class="btn btn-soft" data-action="close-modal">Cancelar</button><button class="btn btn-primary" type="submit" form="contract-intake-activate-form">Activar crédito sin registrar abonos</button>',true);
}
async function contractIntakeConfirmActivation(form){
 if(!contractIntakeAdmin())throw Error('Sin autorización o sincronización pendiente.');
 const fields=Object.fromEntries(new FormData(form)),d=(db.contractTexts||[]).find(x=>x.id===fields.documentId&&x.status==='pending-sale');
 if(!d)throw Error('La ficha no está pendiente de activar.');
 const lot=getLot(d.lotId);if(!lot||lot.residenceId!==d.residenceId||db.sales.some(s=>s.lotId===lot.id))throw Error('Solar no válido o ya vendido.');
 if(activeReservation(lot.id))throw Error('Revisa el apartado existente.');
 const date=buyerDate(fields.date,'fecha del contrato'),firstDueDate=buyerDate(fields.firstDueDate,'primera cuota');
 if(date>businessToday()||firstDueDate<date)throw Error('Revisa la fecha del contrato y primera cuota.');
 const p=d.structured,price=Number(p.price),down=Number(p.down),months=Number(p.months);
 if(!(price>down&&down>=0&&Number.isInteger(months)&&months>=1&&months<=360))throw Error('Importes del contrato inválidos.');
 const next=JSON.parse(JSON.stringify(db)),record=next.contractTexts.find(x=>x.id===d.id),target=next.lots.find(x=>x.id===lot.id);
 const sale={id:'V-'+crypto.randomUUID(),clientId:d.clientId,lotId:d.lotId,type:'credit',price,downPayment:down,months,date,firstDueDate,
  openingPaid:0,importedPaidInstallments:0,historical:true,source:'contract-intake',documentId:record.id};
 next.sales.unshift(sale);record.saleId=sale.id;record.status='active';record.updatedAt=new Date().toISOString();
 target.price=price;target.status='sold';target.mapDebtFlag=false;
 const r=next.residences?.find(r=>r.id===target.residenceId);
 if(r&&target.sourceFeatureKey){r.records??={};r.records[target.sourceFeatureKey]={...(r.records[target.sourceFeatureKey]||{}),lotId:target.id,block:target.block,status:'sold'};}
 cloudWrite(JSON.stringify(next));db=next;await cloudFlush();
 closeModal();render();
 if(cloudBlocked||cloudOffline||cloudQueue?.latest!==cloudQueue?.confirmed)toast('Crédito pendiente de sincronización. No registres pagos hasta confirmar la nube.','error');
 else toast('Crédito activado sin cobros. Ahora puedes registrar primas y cuotas desde Abonos.');
}
const contractIntakeOldContractsPage=contractsPage;
contractsPage=function(){
 const original=contractIntakeOldContractsPage();
 const pending=(db.contractTexts||[]).filter(d=>d.residenceId===residence().id&&d.format==='photo+ocr');
 const box='<section class="card" style="padding:18px;margin:14px 0"><h2>Ingresar clientes desde sus contratos</h2>'+
  '<p>Sube la fotografía, revisa la ficha completa, vincula etapa/bloque/solar y guarda el contrato original. Después activa el crédito con las fechas y registra los abonos normalmente.</p>'+
  '<button type="button" class="btn btn-primary" data-contract-intake-open="true">Subir contrato y crear ficha</button> '+ 
  '<button type="button" class="btn btn-outline" data-contract-rebuild-open="true">Preparar limpieza de clientes</button>'+
  '<div style="margin-top:12px">'+pending.map(d=>{
   const lot=getLot(d.lotId),client=getClient(d.clientId);
   return '<div class="detail-line" style="flex-wrap:wrap"><span>'+esc(client?.name||'Cliente')+' · Etapa '+esc(lot?.stage||'—')+' · Bloque '+esc(lot?.block||'—')+' · Solar '+esc(lot?.sourceNumber||'—')+'</span>'+
   (d.status==='pending-sale'?'<button class="btn btn-outline" type="button" data-contract-intake-activate="'+esc(d.id)+'">Activar crédito</button>':'<span>Crédito registrado</span>')+
   (d.documentKey?'<a class="btn btn-outline" href="/api/app/file?key='+encodeURIComponent(d.documentKey)+'" target="_blank" rel="noopener noreferrer">Ver documento original</a>':'')+'</div>';
  }).join('')+'</div></section>';
 return original.replace('<section class="card" style="padding:20px;margin-bottom:20px">',box+'<section class="card" style="padding:20px;margin-bottom:20px">');
};
document.addEventListener('click',event=>{
 const button=event.target.closest?.('[data-contract-intake-open],[data-contract-intake-activate]');
 if(!button)return;
 event.preventDefault();event.stopImmediatePropagation();
 if(button.hasAttribute('data-contract-intake-open'))contractIntakeOpen();
 else contractIntakeActivate(button.dataset.contractIntakeActivate);
},true);
document.addEventListener('change',event=>{
 if(event.target.id==='contract-intake-file'){
  const file=event.target.files?.[0];
  if(file)contractIntakeRead(file);
 }
},true);
document.addEventListener('submit',event=>{
 if(event.target.id==='contract-intake-form'){
  event.preventDefault();event.stopImmediatePropagation();
  contractIntakeSave(event.target).catch(e=>{
   const area=document.getElementById('contract-intake-alert');
   if(area)area.textContent=e.message;
   toast(e.message,'error');
  });
 }
 if(event.target.id==='contract-intake-activate-form'){
  event.preventDefault();event.stopImmediatePropagation();
  contractIntakeConfirmActivation(event.target).catch(e=>toast(e.message,'error'));
 }
},true);


function contractIntakeDescription(d){
 const info=d?.structured;if(!info)return '';
 const keys=[
  ['Cliente','name'],['Identidad / DNI','identity'],['RTN','rtn'],
  ['Estado civil','maritalStatus'],['Profesión u oficio','occupation'],['Dirección','address'],
  ['Bloque del contrato','block'],['Solar del contrato','number'],['Etapa verificada','stage'],
  ['Área según contrato, varas²','areaVaras'],['Área según contrato, m²','areaM2'],
  ['Norte','north'],['Sur','south'],['Este','east'],['Oeste','west'],
  ['Precio del lote (L)','price'],['Prima pactada (L)','down'],['Saldo financiado (L)','financed'],
  ['Cuota pactada (L)','monthly'],['Plazo, cuotas','months'],['Precio por vara² (L)','pricePerVara'],
  ['Observaciones','observations']
 ];
 const list=keys.map(([label,key])=>{
  const value=info[key];if(value===null||value===undefined||value==='')return '';
  return '<div class="detail-line"><span>'+esc(label)+'</span><strong style="white-space:pre-wrap;overflow-wrap:anywhere;text-align:right">'+esc(String(value))+'</strong></div>';
 }).join('');
 const lot=getLot(d.lotId),delta=Number(lot?.area)>0&&Number(info.areaM2)>0&&Math.abs(Number(lot.area)-Number(info.areaM2))>.02?
  '<p style="color:#9b581f"><strong>Medida protegida:</strong> el catastro conserva '+esc(String(lot.area))+' m² aunque el contrato indique '+esc(String(info.areaM2))+' m².</p>':'';
 return '<section class="card" style="padding:15px;margin-bottom:15px"><h3>Descripción completa del contrato</h3>'+
  '<p class="sm muted">Etapa, bloque y solar identificados en el inventario · documento privado.</p>'+
  list+delta+'<p class="sm muted">La prima del contrato no se registra como pagada al importar. Consulta Abonos para verificar los cobros posteriores.</p>'+
  (d.documentKey?'<a class="btn btn-outline" target="_blank" rel="noopener noreferrer" href="/api/app/file?key='+encodeURIComponent(d.documentKey)+'">Ver fotografía original</a>':'')+'</section>';
}
const contractIntakeOriginalView=viewContractText;
viewContractText=function(id){
 contractIntakeOriginalView(id);
 const d=(db.contractTexts||[]).find(x=>x.id===id&&x.format==='photo+ocr');
 if(d){
  const root=document.querySelector('#modal-root .modal-content');
  if(root)root.insertAdjacentHTML('afterbegin',contractIntakeDescription(d));
  const edit=document.querySelector('#modal-root [data-action="contract-text-edit"]');
  if(edit){edit.disabled=true;edit.title='La ficha revisada no se sobreescribe desde el OCR clásico; conserva sus datos y documento original.';}
 }
};
document.addEventListener('click',event=>{
 const action=event.target.closest?.('[data-action="contract-text-edit"]');
 if(!action)return;
 const doc=(db.contractTexts||[]).find(x=>x.id===action.dataset.id&&x.format==='photo+ocr');
 if(doc){event.preventDefault();event.stopImmediatePropagation();toast('Ficha importada protegida. No se debe reemplazar mediante OCR antiguo.','error');}
},true);

function clientRegisterResetOpen(){
 if(!contractIntakeAdmin()){toast('La limpieza requiere administrador, conexión y datos sincronizados.','error');return;}
 const n=intakeResetPreview(db);
 showModal('Preparar reinicio del padrón',
  '<p><strong>Atención: operación destructiva para los registros de personas.</strong> Solo debes usarla después de descargar un respaldo completo.</p>'+
  '<div class="card" style="padding:14px"><p>Clientes: <b>'+n.clients+'</b> · Ventas: <b>'+n.sales+'</b> · Abonos: <b>'+n.payments+'</b> · Apartados: <b>'+n.reservations+'</b></p>'+
  '<p>Contratos: <b>'+n.contractTexts+'</b> · Historiales: <b>'+(n.historicalPayments+n.historicalContracts+n.ownerPayments+n.ownershipStatements)+'</b></p>'+
  '<p><strong>Se conservan '+n.preservedLots+' solares y '+n.preservedResidences+' residenciales, con etapas, bloques, medidas, precios y croquis.</strong></p>'+
  '<p style="color:#9b4c1f">Los '+n.cashEntriesKept+' movimientos manuales de Caja se conservan: revísalos después porque podrían corresponder a operaciones antiguas.</p></div>'+
  '<button class="btn btn-outline" type="button" data-client-register-backup>1. Descargar respaldo JSON (no incluye imágenes originales)</button>'+
  '<label style="display:block;margin:12px 0"><input type="checkbox" id="client-register-backed-up"> Confirmo que guardé y verifiqué el respaldo JSON; sé que las fotografías originales no van dentro del JSON.</label>'+
  '<label>Escribe <strong>BORRAR PADRON</strong> para desbloquear:<input id="client-register-typed" autocomplete="off" placeholder="BORRAR PADRON"></label>'+
  '<p class="sm muted">Si aún no estás preparado para borrar el padrón actual, cancela. Ningún dato se elimina por entrar a esta ventana.</p>',
  '<button type="button" class="btn btn-outline" data-action="close-modal">Cancelar</button><button type="button" class="btn btn-primary" data-client-register-confirm disabled>2. Eliminar padrón y comenzar desde contratos</button>',true,'No elimina las medidas del inventario');
}
function clientRegisterResetToggle(){
 const button=document.querySelector('[data-client-register-confirm]');
 if(button)button.disabled=!(document.getElementById('client-register-backed-up')?.checked&&document.getElementById('client-register-typed')?.value.trim().toUpperCase()==='BORRAR PADRON');
}
async function clientRegisterResetExecute(){
 if(!contractIntakeAdmin())throw Error('Datos no sincronizados o sesión no autorizada.');
 const backed=document.getElementById('client-register-backed-up')?.checked;
 const phrase=document.getElementById('client-register-typed')?.value.trim().toUpperCase();
 if(!backed||phrase!=='BORRAR PADRON')throw Error('Es obligatorio conservar un respaldo antes de comenzar.');
 const counts=intakeResetPreview(db),message='¿Confirmas eliminar '+counts.clients+' clientes, '+counts.sales+' ventas y '+counts.payments+' abonos actuales del sistema? Las medidas, el croquis y los solares se conservarán. Únicamente podrás recuperarlos desde el respaldo o historial del servidor.';
 if(!confirm(message))return;
 const before=JSON.stringify(db);
 const next=intakePrepareFreshClientRegister(db);
 if(next.lots.length!==db.lots.length||next.residences.length!==db.residences.length)throw Error('Se detectó un cambio inesperado del catastro. Operación cancelada.');
 // Una segunda verificación comprueba que ni áreas ni polígonos se alteraron.
 for(let i=0;i<db.lots.length;i++){
  const old=db.lots[i],fresh=next.lots[i];
  if(old.id!==fresh.id||old.area!==fresh.area||JSON.stringify(old.dimensions||{})!==JSON.stringify(fresh.dimensions||{})||
     old.stage!==fresh.stage||old.block!==fresh.block||old.price!==fresh.price||old.sourceFeatureKey!==fresh.sourceFeatureKey)
    throw Error('La limpieza cambió las medidas o referencias de un solar. Operación cancelada.');
 }
 if(before!==JSON.stringify(db))throw Error('Los datos cambiaron durante la revisión.');
 cloudWrite(JSON.stringify(next));db=next;
 await cloudFlush();
 closeModal();render();
 if(cloudBlocked||cloudOffline||cloudQueue?.latest!==cloudQueue?.confirmed)
  toast('Padrón preparado, pero el servidor no confirmó la sincronización. No ingreses contratos hasta resolver la nube.','error');
 else toast('Padrón limpio. Se conservaron todas las medidas y los solares. Ya puedes subir los contratos.');
}
document.addEventListener('click',event=>{
 const b=event.target.closest?.('[data-contract-rebuild-open],[data-client-register-backup],[data-client-register-confirm]');
 if(!b)return;
 event.preventDefault();event.stopImmediatePropagation();
 if(b.hasAttribute('data-contract-rebuild-open'))return clientRegisterResetOpen();
 if(b.hasAttribute('data-client-register-backup')){
  const stamp=new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
  download('LOTIGEST_RESPALDO_ANTES_DE_REINICIAR_CLIENTES_'+stamp+'.json',JSON.stringify(db,null,2),'application/json');
  return;
 }
 clientRegisterResetExecute().catch(e=>toast(e.message,'error'));
},true);
document.addEventListener('input',event=>{
 if(event.target.id==='client-register-typed')clientRegisterResetToggle();
},true);
document.addEventListener('change',event=>{
 if(event.target.id==='client-register-backed-up')clientRegisterResetToggle();
},true);
