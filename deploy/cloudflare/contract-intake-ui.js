// LOTIGEST · Contratos primero: del documento a la ficha del cliente.
// Nunca convierte "prima pactada" en un pago recibido. OCR y validación son revisables.
let contractIntakeWorking=null;
function contractIntakeAdmin(){
 return cloudReady&&cloudUser?.role==='admin'&&sessionStorage.getItem(SESSION)==='yes'&&navigator.onLine!==false&&!cloudBusy&&!cloudBlocked&&!cloudQueue?.pending&&cloudQueue?.latest===cloudQueue?.confirmed;
}
function contractIntakeFormatMoney(n){return Number(n||0).toLocaleString('es-HN',{minimumFractionDigits:2,maximumFractionDigits:2});}
function contractIntakeRememberExtras(form){
 if(!form||!contractIntakeWorking)return;
 const data=contractIntakeData(form);
 contractIntakeWorking.values={...contractIntakeWorking.values,...data};
 contractIntakeWorking.extraLots=(contractIntakeWorking.extraLots||[]).map((old,i)=>{
  const lot=getLot(data['extraLotId_'+i]);
  return {...old,stage:data['extraStage_'+i]||'',lotId:data['extraLotId_'+i]||'',
   ...(lot?{block:lot.block,number:String(lot.sourceNumber||lot.number||'')}:{}),
   price:data['solarPrice_'+(i+1)]??'',down:data['solarDown_'+(i+1)]??''};
 });
}
function contractIntakeExtraFields(rows,c){
 const extras=contractIntakeWorking?.extraLots||[];
 const amount=(label,key,value)=>'<label class="field-group"><span>'+label+'</span><input type="number" name="'+key+'" min="0" step="0.01" required value="'+esc(value??'')+'"></label>';
 let html=extras.length?'<div class="full notice-card"><strong>Distribución de la ficha entre '+(extras.length+1)+' solares</strong><p>Los precios y primas por solar deben sumar el total del documento. No repitas el total en cada solar. Las medidas conjuntas se conservan en la ficha sin copiarlas a cada terreno.</p></div>'+amount('Precio del primer solar (L)','solarPrice_0',c.solarPrice_0)+amount('Prima del primer solar (L)','solarDown_0',c.solarDown_0):'';
 extras.forEach((row,i)=>{
  const stage=String(row.stage||c.stage||''),available=rows.filter(l=>String(l.stage)===stage);
  const matches=intakeSolarCandidates(available,stage,row.block,row.number);
  const selected=available.some(l=>l.id===row.lotId)?row.lotId:matches.length===1?matches[0].id:'';
  html+='<fieldset class="full" style="min-width:0;border:1px solid #c9dcd0;padding:12px;border-radius:10px"><legend>Solar '+(i+2)+'</legend><div class="form-grid">'+
   '<label class="field-group"><span>Etapa</span><select name="extraStage_'+i+'" required><option value="">Selecciona etapa</option>'+[1,2].map(n=>'<option value="'+n+'" '+(stage===String(n)?'selected':'')+'>Etapa '+n+'</option>').join('')+'</select></label>'+
   '<label class="field-group"><span>Solar del inventario</span><select name="extraLotId_'+i+'" required><option value="">Selecciona bloque y solar</option>'+available.map(l=>'<option value="'+esc(l.id)+'" '+(selected===l.id?'selected':'')+' '+(db.sales.some(s=>s.lotId===l.id)||l.pendingContractId?'disabled':'')+'>Bloque '+esc(l.block)+' · Solar '+esc(l.sourceNumber||l.number||l.id)+'</option>').join('')+'</select></label>'+
   amount('Precio de este solar (L)','solarPrice_'+(i+1),row.price)+amount('Prima de este solar (L)','solarDown_'+(i+1),row.down)+
   '</div><button type="button" class="btn btn-outline" data-contract-intake-remove="'+i+'">Quitar este solar</button></fieldset>';
 });
 return html+'<div class="full"><button type="button" class="btn btn-outline" data-contract-intake-add="true">+ Agregar otro solar a esta ficha</button></div>';
}
document.addEventListener('click',event=>{
 const add=event.target.closest?.('[data-contract-intake-add]'),remove=event.target.closest?.('[data-contract-intake-remove]');
 if((!add&&!remove)||!contractIntakeWorking||contractIntakeWorking.busy)return;
 event.preventDefault();event.stopImmediatePropagation();
 contractIntakeRememberExtras(document.getElementById('contract-intake-form'));
 contractIntakeWorking.extraLots??=[];
 if(add)contractIntakeWorking.extraLots.push({stage:String(contractIntakeWorking.values.stage||''),lotId:'',price:'',down:''});
 else contractIntakeWorking.extraLots.splice(Number(remove.dataset.contractIntakeRemove),1);
 document.getElementById('contract-intake-review').innerHTML=contractIntakeFields();
},true);
function contractIntakeFields(){
 const c=contractIntakeWorking?.values||{};
 const input=(label,key,type='text',readonly=false)=>'<label class="field-group"><span>'+esc(label)+'</span><input name="'+key+'" type="'+type+'" '+(type==='number'?'step="'+(key==='months'?'1':'any')+'" min="0" ':'')+(key==='identity'?'inputmode="numeric" autocomplete="off" maxlength="19" placeholder="0000 0000 00000" required ':'')+(readonly?'readonly ':'')+'value="'+esc(c[key]??'')+'" style="width:100%;min-width:0"></label>';
 const rows=residenceLots().filter(l=>l.type!=='private'&&l.status!=='private').sort((a,b)=>(Number(a.stage||0)-Number(b.stage||0))||String(a.block||'').localeCompare(String(b.block||''),'es')||String(a.sourceNumber||a.id).localeCompare(String(b.sourceNumber||b.id),'es'));
 const stageChosen=[1,2].includes(Number(c.stage))?String(c.stage):'';
 const stageRows=stageChosen?rows.filter(l=>Number(l.stage)===Number(stageChosen)):[];
 const matched=intakeSolarCandidates(stageRows,stageChosen,c.block,c.number).filter(l=>!db.sales.some(s=>s.lotId===l.id));
 const selectedId=matched.length===1?matched[0].id:(matched.some(l=>l.id===contractIntakeWorking?.selectedLotId)?contractIntakeWorking.selectedLotId:'');
 const clientSelection=contractIntakeWorking?.preferredClientId||
  (db.clients.filter(cl=>normalizeClientLookup(cl.identity)&&normalizeClientLookup(cl.identity)===normalizeClientLookup(c.identity)).length===1?
   db.clients.find(cl=>normalizeClientLookup(cl.identity)===normalizeClientLookup(c.identity)).id:'');
 const clientPicker='<label class="field-group full"><span>Cliente ya registrado (opcional, para no duplicar)</span><select name="clientId"><option value="">Crear o buscar por DNI</option>'+
  db.clients.map(cl=>'<option value="'+esc(cl.id)+'" '+(cl.id===clientSelection?'selected':'')+'>'+esc(cl.name)+' · '+esc(cl.identity||'Sin identidad')+'</option>').join('')+'</select></label>';
 const stagePicker='<label class="field-group full"><span>Etapa del contrato (selección manual obligatoria)</span><select id="contract-intake-stage" name="stage" required>'+
 '<option value="">Selecciona una etapa</option>'+
 '<option value="1" '+(stageChosen==='1'?'selected':'')+'>Etapa 1</option>'+
 '<option value="2" '+(stageChosen==='2'?'selected':'')+'>Etapa 2</option></select></label>';
 const pick='<label class="field-group full"><span>'+(contractIntakeWorking?.mode==='manual'?'Solar del inventario':'Primer solar del inventario, reconocido por OCR')+'</span><select name="lotId" id="contract-intake-lot" required>'+
 '<option value="">'+(stageChosen?'Verifica el bloque y solar':'Primero elige Etapa 1 o Etapa 2')+'</option>'+
 stageRows.map(l=>'<option value="'+esc(l.id)+'" '+(l.id===selectedId?'selected':'')+' '+(db.sales.some(s=>s.lotId===l.id)?'disabled':'')+'>Bloque '+esc(l.block||'—')+' · Solar '+esc(l.sourceNumber||l.id)+' · '+esc(l.area||'sin medida')+' m²</option>').join('')+
 '</select><small id="contract-intake-solar-status" role="status">'+
 (stageChosen?(matched.length===1?'Coincidencia: Bloque '+esc(c.block)+' · Solar '+esc(c.number):matched.length?'Hay varias coincidencias; revisa el solar.':'No se encontró coincidencia única. Puedes corregir el bloque o solar.'):
 'Pendiente: selecciona una etapa.')+'</small></label>';
 const labels=[
  ['Nombre completo','name'],['Identidad / DNI','identity'],['RTN (opcional)','rtn'],['Estado civil','maritalStatus'],
  ['Profesión u oficio','occupation'],['Dirección','address'],['Bloque leído','block'],['Solar leído','number'],
  ['Área del documento (varas²)','areaVaras','number'],['Área del documento (m²)','areaM2','number'],
  ['Norte','north'],['Sur','south'],['Este','east'],['Oeste','west'],
  ['Precio total de la ficha, todos los solares (L)','price','number'],['Prima total pactada de la ficha (L)','down','number'],
  ['Saldo a financiar (L)','financed','number'],['Cuota del documento (L)','monthly','number'],
  ['Plazo (meses)','months','number'],['Precio por vara² (L)','pricePerVara','number']
 ];
 const extraPicker=contractIntakeExtraFields(rows,c);
 const fields=labels.map(([label,key,type])=>input(label,key,type)).join('');
 const areaWarnings=matched.length===1&&Number(matched[0].area)>0&&Number(c.areaM2)>0&&Math.abs(Number(matched[0].area)-Number(c.areaM2))>.02?
 '<p style="color:#965a18"><strong>Medidas distintas:</strong> inventario '+esc(matched[0].area)+' m², documento '+esc(c.areaM2)+' m². Se conservará la medida original; revisa la discrepancia.</p>':'';
 const warning=(!stageChosen?'':matched.length>1?
 '<p style="color:#a35a1b">Hay varios solares con el mismo bloque y número en esta etapa: selecciona el correcto.</p>':
 !matched.length?'<p style="color:#a35a1b">No hay una coincidencia única en la etapa elegida. Corrige bloque o solar del OCR.</p>':'')+areaWarnings;
 return '<form id="contract-intake-form"><p class="sm muted">'+(contractIntakeWorking?.mode==='manual'?'Ingresa los datos de la ficha y elige la etapa y solar exactos. No necesitas subir imágenes.':'El documento debe revisarse antes de confirmar. La etapa no se supone si no aparece en la imagen.')+' No reemplazamos medidas existentes, ventas ni abonos.</p>'+warning+
  '<div class="form-grid">'+clientPicker+stagePicker+pick+extraPicker+fields+'</div>'+
  '<label>Observaciones del documento<textarea name="observations" rows="4" style="width:100%">'+esc(c.observations||'')+'</textarea></label>'+
  (contractIntakeWorking?.mode==='manual'?'':'<details><summary>Ver/corregir texto reconocido completo</summary><textarea name="rawText" rows="9" style="width:100%">'+esc(c.rawText||'')+'</textarea></details>')+
  '<div id="contract-intake-alert" role="alert">'+(!String(c.name||'').trim()?'<strong>Falta el nombre del cliente.</strong> Corrígelo antes de guardar.':'')+'</div>'+
  '<p class="sm muted">Guardar ficha crea el cliente y su documento vinculado, NO registra la prima cobrada ni genera cuotas. Para registrar la venta necesitarás fecha de contrato y primer vencimiento; después podrás ingresar los abonos desde el módulo normal.</p></form>';
}
function contractIntakeOpen(clientId='',mode='ocr'){
 if(!contractIntakeAdmin()){toast('Solo el administrador, con datos sincronizados y conexión, puede registrar contratos.','error');return;}
 const existing=clientId?getClient(clientId):null;
 if(clientId&&!existing){toast('No se encontró al cliente seleccionado.','error');return;}
 const manual=mode==='manual';
 contractIntakeWorking={mode:manual?'manual':'ocr',residenceId:residence().id,file:null,preferredClientId:existing?.id||'',values:existing?{
 name:existing.name||'',identity:existing.identity||'',rtn:existing.rtn||'',maritalStatus:existing.maritalStatus||'',
 occupation:existing.occupation||'',address:existing.address||''
 }:{},readVersion:0,busy:false};
 const content=manual?
  '<p>Completa la ficha de contrato escribiendo los datos directamente. Se utilizará el cliente seleccionado; revisa etapa, bloque, solar, precio, prima pactada y plazo antes de guardar.</p>'+
  '<div id="contract-intake-review">'+contractIntakeFields()+'</div>':
  '<p>Primer paso: sube una foto legible del documento de compra de esta residencial.</p>'+
  '<label class="field-group"><span>Imagen del contrato</span><input id="contract-intake-file" type="file" accept="image/jpeg,image/png,image/webp"></label>'+
  '<p class="sm muted">El OCR se realiza en tu dispositivo. Luego podrás revisar los datos antes de guardar; la imagen original se almacena de forma privada en LOTIGEST al confirmar.</p>'+
  '<div id="contract-intake-status" role="status"></div><button type="button" id="contract-intake-retry" class="btn btn-outline" hidden>Volver a leer la foto</button><div id="contract-intake-review"></div>';
 showModal(manual?'Llenar ficha de contrato manual':'Registrar cliente desde contrato',content,
 '<button type="button" class="btn btn-outline" data-action="close-modal">Cancelar</button><button type="submit" id="contract-intake-save" form="contract-intake-form" class="btn btn-primary" '+(manual?'':'disabled')+'>Guardar ficha revisada</button>',
 true,'Contratos → Cliente → Solares → Abonos');
}
// Recursos versionados servidos por el mismo sitio, sin descargas de CDN en el teléfono.
let contractIntakeOcrLoading=null;
function loadContractIntakeOcr(){
 if(window.Tesseract)return Promise.resolve(window.Tesseract);
 if(!contractIntakeOcrLoading)contractIntakeOcrLoading=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='/ocr/v5/tesseract.min.js';
  script.onload=()=>{if(window.Tesseract)resolve(window.Tesseract);else{contractIntakeOcrLoading=null;script.remove();reject(Error('El lector no se pudo iniciar. Vuelve a intentar.'));}};
  script.onerror=()=>{contractIntakeOcrLoading=null;script.remove();reject(Error('No se pudo descargar el lector. Comprueba la conexión y pulsa Volver a leer la foto.'));};
  document.head.appendChild(script);
 });
 return contractIntakeOcrLoading;
}
document.addEventListener('click',event=>{
 if(event.target.id!=='contract-intake-retry')return;
 event.preventDefault();
 if(contractIntakeWorking?.file&&!contractIntakeWorking.busy)contractIntakeRead(contractIntakeWorking.file);
},true);
async function decodeContractIntakeImage(file){
 try{if(typeof createImageBitmap==='function')return await createImageBitmap(file);}catch{}
 // Algunos teléfonos pueden mostrar un JPG aunque createImageBitmap no lo decodifique.
 const url=URL.createObjectURL(file);
 try{return await new Promise((resolve,reject)=>{
  const image=new Image();image.onload=()=>resolve({width:image.naturalWidth,height:image.naturalHeight,image,close(){}});
  image.onerror=()=>reject(Error('El teléfono no pudo abrir esta imagen. Prueba con otra foto JPG o PNG.'));image.src=url;
 });}finally{URL.revokeObjectURL(url);}
}
async function contractIntakeRead(file){
 const scan=contractIntakeWorking,status=document.getElementById('contract-intake-status'),box=document.getElementById('contract-intake-review'),saveBtn=document.getElementById('contract-intake-save'),retryBtn=document.getElementById('contract-intake-retry');
 if(!scan||!file||!status||!box)return;
 const reviewForm=document.getElementById('contract-intake-form');
 if(reviewForm){const edited=contractIntakeData(reviewForm);scan.values={...scan.values,...edited};scan.preferredClientId=edited.clientId||scan.preferredClientId||'';}
 const version=++scan.readVersion;
 if(file.size>12*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type)){
  status.textContent='Usa una imagen JPG, PNG o WebP de hasta 12 MB.';return;
 }
 scan.busy=true;saveBtn.disabled=true;scan.file=file;if(retryBtn){retryBtn.hidden=true;retryBtn.disabled=true;}
 let bmp=null,worker=null,canvas=null;
 try{
  status.textContent='Preparando imagen y leyendo el documento…';
  bmp=await decodeContractIntakeImage(file);
  canvas=document.createElement('canvas');
  const factor=Math.min(1,2200/Math.max(bmp.width,bmp.height));
  canvas.width=Math.max(1,Math.round(bmp.width*factor));canvas.height=Math.max(1,Math.round(bmp.height*factor));
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bmp.image||bmp,0,0,canvas.width,canvas.height);bmp.close();bmp=null;
  status.textContent='Cargando lector de español…';
  const T=await loadContractIntakeOcr();
  worker=await T.createWorker('spa',1,{
   workerPath:location.origin+'/ocr/v5/worker.min.js',
   workerBlobURL:false,
   cachePath:'lotigest-spa-best-int-v1',
   corePath:location.origin+'/ocr/v5/core',
   langPath:location.origin+'/ocr/v5/lang',
   errorHandler:()=>{},
   logger:m=>{if(scan===contractIntakeWorking&&status.isConnected&&m.status==='recognizing text')status.textContent='Reconociendo texto: '+Math.round((m.progress||0)*100)+'%';}});
  const {data}=await worker.recognize(canvas,{rotateAuto:true});
  if(scan!==contractIntakeWorking||version!==scan.readVersion)return;
  const read=parseContractIntake(data.text||'');
  // Si el OCR no reconoce el nombre, conservar los datos del cliente previamente elegido.
  const previous=scan.values||{};
  scan.values={...read,...Object.fromEntries(['name','identity','rtn','maritalStatus','occupation','address'].filter(key=>!String(read[key]||'').trim()&&String(previous[key]||'').trim()).map(key=>[key,previous[key]]))};
  // La etapa nunca se rellena desde el OCR: el administrador debe elegirla.
  scan.values.stage=[1,2].includes(Number(previous.stage))?Number(previous.stage):null;
  scan.values._confidence=Math.round(data.confidence||0);
  if((read.numbers||[]).length>1&&!scan.extraLots?.length)scan.extraLots=read.numbers.slice(1).map(number=>({stage:'',block:read.block,number,lotId:'',price:'',down:''}));
  box.innerHTML=contractIntakeFields();
  saveBtn.disabled=false;
  status.textContent='Lectura lista ('+scan.values._confidence+'%). '+(contractIdentityDigits(scan.values.identity).length===13?'DNI del titular encontrado: '+contractIdentityFormat(scan.values.identity)+'. ':'DNI del titular no leído con seguridad: complétalo manualmente. ')+'Verifica etapa, colindancias y precio antes de guardar.';
 }catch(e){
  if(scan!==contractIntakeWorking)return;
  scan.values={...scan.values}; // Conservar el nombre y DNI del cliente seleccionado si falla el OCR.
  box.innerHTML=contractIntakeFields();
  saveBtn.disabled=false;
  const detail=String(e?.message||e||'Error del lector').slice(0,240);
  status.textContent='No se pudo completar la lectura: '+detail+'. Pulsa Volver a leer la foto para reintentar. La imagen y los datos escritos se conservan.';
 }finally{
  if(bmp)bmp.close();if(worker)await worker.terminate().catch(()=>{});if(canvas){canvas.width=1;canvas.height=1;}
  if(scan===contractIntakeWorking){scan.busy=false;if(retryBtn){retryBtn.hidden=false;retryBtn.disabled=false;}}
 }
}
function contractIntakeData(form){
 const values=Object.fromEntries(new FormData(form));
 values.identity=contractIdentityFormat(values.identity);
 for(const key of ['areaVaras','areaM2','price','down','financed','monthly','months','pricePerVara']){
  values[key]=values[key]===''?null:Number(values[key]);
 }
 if(Object.keys(values).some(key=>/^extraLotId_/.test(key))){
  values.lots=[{lotId:values.lotId,stage:values.stage,price:values.solarPrice_0,down:values.solarDown_0},...Object.keys(values).filter(key=>/^extraLotId_/.test(key)).map(key=>{const i=key.split('_')[1];return {lotId:values[key],stage:values['extraStage_'+i],price:values['solarPrice_'+(Number(i)+1)],down:values['solarDown_'+(Number(i)+1)]};})];
 }
 return values;
}
function contractIntakeFindClient(state,data){
 const identity=normalizeClientLookup(data.identity),normalizedName=normalizeClientLookup(data.name);
 const matches=state.clients.filter(c=>identity&&normalizeClientLookup(c.identity)===identity);
 if(matches.length>1)throw Error('Hay identidades duplicadas. Revisa Clientes.');
 const selected=data.clientId?state.clients.find(c=>c.id===data.clientId):null;
 if(data.clientId&&!selected)throw Error('No se encontró el cliente existente seleccionado.');
 if(selected&&matches.length&&matches[0].id!==selected.id)throw Error('El DNI pertenece a otro cliente. No se pueden unir dos personas diferentes.');
 const sameName=state.clients.filter(c=>normalizeClientLookup(c.name)===normalizedName&&(!normalizeClientLookup(c.identity)||normalizeClientLookup(c.identity)===identity));
 const client=selected||matches[0]||(sameName.length===1?sameName[0]:null);
 if(!client){
  const created={id:'C-'+crypto.randomUUID(),name:String(data.name).trim().toUpperCase(),
   identity:String(data.identity).trim(),phone:'',address:String(data.address||'').trim(),
   email:'',rtn:String(data.rtn||'').trim(),maritalStatus:String(data.maritalStatus||'').trim(),
   occupation:String(data.occupation||'').trim()};
  state.clients.unshift(created);return created;
 }
 if(normalizeClientLookup(client.name)!==normalizedName)throw Error('El nombre del contrato no coincide con el cliente registrado. Corrige o elige la ficha correcta.');
 if(client.identity&&normalizeClientLookup(client.identity)!==identity)throw Error('El DNI no coincide con el cliente existente.');
 const fields=['identity','address','rtn','maritalStatus','occupation'];
 for(const key of fields){
  if(!String(client[key]||'').trim()&&String(data[key]||'').trim())client[key]=String(data[key]).trim();
 }
 return client;
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
 const data=contractIntakeData(form);
 if(original.mode!=='manual'&&!original.file)throw Error('Debes subir primero la foto del documento original.');
 if(original.residenceId!==residence().id)throw Error('La residencial cambió; revisa la ficha.');
 const planned=intakePlanLots(data,db.lots,original.residenceId);
 for(const {lot} of planned){
  if(db.sales.some(s=>s.lotId===lot.id))throw Error('Uno de los solares ya tiene una venta.');
  if(lot.pendingContractId)throw Error('Uno de los solares ya tiene contrato pendiente.');
  if(activeReservation(lot.id))throw Error('Uno de los solares tiene un apartado vigente.');
  if((db.contractTexts||[]).some(d=>d.lotId===lot.id&&d.status!=='voided'))throw Error('Ya existe un documento asociado a uno de los solares.');
 }
 const price=Number(data.price),down=Number(data.down),months=Number(data.months);
 if(Number(data.financed)!=null&&data.financed!==null&&Math.abs(Number(data.financed)-(price-down))>.06)throw Error('El saldo del documento no coincide con precio menos prima.');
 const expected=Math.round((price-down)/months*100)/100;
 if(data.monthly!=null&&Math.abs(data.monthly-expected)>.03)throw Error('La cuota ingresada no coincide con la amortización a 0 %. Verifica la cuota y el plazo.');
 if(button)button.disabled=true;original.busy=true;
 try{
  const snapshot=JSON.stringify(db);
  const key=original.mode==='manual'?null:await contractIntakeStorePhoto(original.file);
  if(!contractIntakeAdmin()||contractIntakeWorking!==original||snapshot!==JSON.stringify(db))throw Error('El inventario cambió. Vuelve a revisar el contrato.');
  const next=JSON.parse(snapshot);
  const client=contractIntakeFindClient(next,data);
  if(contractIdentityDigits(client.identity)!==contractIdentityDigits(data.identity))throw Error('El número de identidad no coincide con el contrato. Revisa y vuelve a guardar.');
  const groupId=planned.length>1?'CG-'+crypto.randomUUID():null;
  const now=new Date().toISOString();
  for(const {lot,fields} of planned){
   const target=next.lots.find(l=>l.id===lot.id);
   if(target.ownerClientId&&target.ownerClientId!==client.id)throw Error('Un solar ya está asignado a otro cliente; verifica la identidad.');
   const {rawText:sourceOCR,...structuredFields}=fields;
   // Las claves auxiliares del formulario no forman parte de la descripción.
   for(const k of Object.keys(structuredFields))if(/^(?:extra|solarPrice_|solarDown_)/.test(k))delete structuredFields[k];
   const record={id:(original.mode==='manual'?'CM-':'OCR-')+crypto.randomUUID(),clientId:client.id,lotId:lot.id,saleId:'',residenceId:original.residenceId,
    title:'FICHA CONTRACTUAL DE '+String(client.name).slice(0,85),pages:original.mode==='manual'?[]:[{number:1,text:String(data.rawText||'').slice(0,50000),confidence:original.values._confidence??null}],
    structured:{...structuredFields,identity:contractIdentityFormat(client.identity),lotId:lot.id,stage:lot.stage??null,monthlyCalculated:Math.round((fields.price-fields.down)/months*100)/100,downPaymentReceived:false},
    ...(groupId?{contractGroupId:groupId,contractLotIds:planned.map(r=>r.lot.id)}:{}),
    ...(key?{documentKey:key,documentMime:original.file.type}:{}),format:original.mode==='manual'?'manual':'photo+ocr',status:'pending-sale',createdAt:now,updatedAt:now};
   next.contractTexts??=[];next.contractTexts.unshift(record);
   target.ownerClientId=client.id;target.pendingContractId=record.id;
   if(!(Number(target.area)>0)&&Number(fields.areaM2)>0){target.area=Number(fields.areaM2);target.areaMode='manual';target.areaOrigin='contract-reviewed';}
   if(!(Number(target.areaVaras2)>0)&&Number(fields.areaVaras)>0)target.areaVaras2=Number(fields.areaVaras);
   if(!(Number(target.price)>0))target.price=fields.price;
  }
  // El estado de venta sólo se actualizará al activar el crédito.
  cloudWrite(JSON.stringify(next));db=next;
  await cloudFlush();
  if(cloudBlocked||cloudOffline||cloudQueue?.latest!==cloudQueue?.confirmed){
   toast('La ficha se conserva pendiente de sincronizar. Comprueba el indicador de nube antes de ingresar otro contrato.','error');
  }else if(contractIdentityDigits(getClient(client.id)?.identity)!==contractIdentityDigits(data.identity))toast('El servidor confirmó el guardado, pero no aparece el DNI correcto. No registres abonos y revisa Clientes.','error');
  else toast('Ficha y DNI guardados para '+planned.length+' solar(es). Puedes activar cada crédito y registrar los abonos.');
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
 target.price=price;target.status='sold';target.mapDebtFlag=false;target.ownerClientId=d.clientId;delete target.pendingContractId;
 const r=next.residences?.find(r=>r.id===target.residenceId);
 if(r&&target.sourceFeatureKey){r.records??={};r.records[target.sourceFeatureKey]={...(r.records[target.sourceFeatureKey]||{}),lotId:target.id,block:target.block,status:'sold'};}
 cloudWrite(JSON.stringify(next));db=next;await cloudFlush();
 closeModal();render();
 if(cloudBlocked||cloudOffline||cloudQueue?.latest!==cloudQueue?.confirmed)toast('Crédito pendiente de sincronización. No registres pagos hasta confirmar la nube.','error');
 else toast('Crédito activado sin cobros. Ahora puedes registrar primas y cuotas desde Abonos.');
}
const contractIntakeOldContractsPage=contractsPage;
contractsPage=function(){
 const original=contractIntakeOldContractsPage()
  .replace(/<button\b[^>]*data-action="contract-scan-choose"[^>]*>[\s\S]*?<\/button>/,'')
  .replace('Escanea hasta tres páginas por contrato y guarda solo su texto.','Carga la fotografía, verifica nombre y ficha completa, vincula el solar y activa el crédito después.');
 const pending=(db.contractTexts||[]).filter(d=>d.residenceId===residence().id&&['photo+ocr','manual'].includes(d.format));
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
// Etapa manual y datos del OCR: encontrar solar sin usar una etapa adivinada.
document.addEventListener('change',event=>{
 const target=event.target,form=target.closest?.('#contract-intake-form');
 if(!form||!contractIntakeWorking)return;
 if(!['stage','block','number','lotId'].includes(target.name)&&!/^extra(?:LotId|Stage)_/.test(target.name))return;
 contractIntakeRememberExtras(form);
 const data=contractIntakeData(form);
 if(/^extraStage_/.test(target.name))contractIntakeWorking.extraLots[Number(target.name.split('_')[1])].lotId='';
 if(target.name==='lotId'&&data.lotId){
  const chosen=getLot(data.lotId);
  if(chosen){
   data.stage=String(chosen.stage);
   data.block=String(chosen.block||'');
   data.number=String(chosen.sourceNumber||chosen.number||'');
  }
 }
 if(target.name==='stage'||target.name==='block'||target.name==='number')contractIntakeWorking.selectedLotId='';
 else contractIntakeWorking.selectedLotId=data.lotId||'';
 contractIntakeWorking.preferredClientId=data.clientId||'';
 contractIntakeWorking.values={...contractIntakeWorking.values,...data};
 const review=document.getElementById('contract-intake-review');
 if(review)review.innerHTML=contractIntakeFields();
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
  ['Área conjunta del documento, varas²','documentAreaVaras'],['Área conjunta del documento, m²','documentAreaM2'],
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
  (d.contractLotIds?.length>1?'<p><b>Ficha compartida:</b> '+esc(d.contractLotIds.map(id=>{const l=getLot(id);return 'Etapa '+l?.stage+' · Bloque '+l?.block+' · Solar '+(l?.sourceNumber||l?.number||id);}).join('; '))+'. Los importes de abajo corresponden solo a este solar.</p>':'')+list+delta+'<p class="sm muted">La prima del contrato no se registra como pagada al importar. Consulta Abonos para verificar los cobros posteriores.</p>'+
  (d.documentKey?'<a class="btn btn-outline" target="_blank" rel="noopener noreferrer" href="/api/app/file?key='+encodeURIComponent(d.documentKey)+'">Ver fotografía original</a>':'')+
  '<button type="button" class="btn btn-outline" data-contract-dni-edit="'+esc(d.id)+'">Corregir DNI del cliente</button></section>';
}
const contractIntakeOriginalView=viewContractText;
viewContractText=function(id){
 contractIntakeOriginalView(id);
 const d=(db.contractTexts||[]).find(x=>x.id===id&&['photo+ocr','manual'].includes(x.format));
 if(d){
  const root=document.querySelector('#modal-root .modal-content');
  if(root)root.insertAdjacentHTML('afterbegin',contractIntakeDescription(d));
  const edit=document.querySelector('#modal-root [data-action="contract-text-edit"]');
  if(edit){edit.disabled=true;edit.title='La ficha revisada no se sobreescribe desde el editor clásico; conserva sus datos.';}
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


// Corregir identidad de una ficha previamente importada, sin recargar ni duplicar el contrato.
function contractDniEditOpen(documentId){
 if(!contractIntakeAdmin()){toast('Necesitas acceso de administrador y sincronización confirmada.','error');return;}
 const doc=(db.contractTexts||[]).find(d=>d.id===documentId&&['photo+ocr','manual'].includes(d.format)&&d.status!=='voided');
 const client=doc&&getClient(doc.clientId);
 if(!client){toast('No se encontró el cliente de esta ficha.','error');return;}
 showModal('Corregir DNI de la ficha contractual',
  '<p><strong>'+esc(client.name)+'</strong></p><p class="sm muted">Esta corrección actualizará el cliente y sus fichas contractuales, sin crear ventas ni abonos. Comprueba el documento original.</p>'+
  '<form id="contract-dni-edit-form"><input type="hidden" name="documentId" value="'+esc(doc.id)+'">'+
  '<label>DNI del titular (13 dígitos)<input type="text" name="identity" required inputmode="numeric" maxlength="19" autocomplete="off" value="'+esc(contractIdentityFormat(client.identity||doc.structured?.identity||''))+'" placeholder="0000 0000 00000"></label>'+
  '</form>',
  '<button class="btn btn-outline" data-action="close-modal" type="button">Cancelar</button>'+
  '<button class="btn btn-primary" type="submit" form="contract-dni-edit-form">Guardar DNI corregido</button>',true);
}
async function contractDniEditSave(form){
 if(!contractIntakeAdmin())throw Error('La sesión no está disponible o la nube no está sincronizada.');
 const data=Object.fromEntries(new FormData(form));
 const digits=contractIdentityDigits(data.identity);
 if(digits.length!==13)throw Error('El DNI debe tener 13 dígitos. Revisa la fotografía del contrato.');
 const doc=(db.contractTexts||[]).find(d=>d.id===data.documentId&&['photo+ocr','manual'].includes(d.format)&&d.status!=='voided');
 if(!doc)throw Error('No existe la ficha contractual.');
 const client=getClient(doc.clientId);
 if(!client)throw Error('No se encontró al titular del contrato.');
 if(db.clients.some(c=>c.id!==client.id&&contractIdentityDigits(c.identity)===digits))throw Error('El DNI ya está asignado a otro cliente. Revisa duplicados.');
 const oldDigits=contractIdentityDigits(client.identity);
 if(oldDigits.length===13&&oldDigits!==digits&&!confirm('El cliente ya tenía una identidad registrada. ¿Confirmas la corrección de acuerdo con el contrato original?'))return;
 // Si el titular tiene otra ficha con una identidad diferente ya validada, bloquear la actualización.
 const docs=(db.contractTexts||[]).filter(d=>d.clientId===client.id&&['photo+ocr','manual'].includes(d.format)&&d.status!=='voided');
 if(docs.some(d=>{const v=contractIdentityDigits(d.structured?.identity);return v.length===13&&v!==digits&&v!==oldDigits;}))
  throw Error('Otra ficha del mismo cliente presenta un DNI distinto. Revisa antes de unificar.');
 const next=JSON.parse(JSON.stringify(db)),found=next.clients.find(c=>c.id===client.id);
 found.identity=contractIdentityFormat(data.identity);
 for(const d of next.contractTexts||[]){
  if(d.clientId===client.id&&['photo+ocr','manual'].includes(d.format)&&d.status!=='voided'){
   d.structured??={};d.structured.identity=found.identity;d.updatedAt=new Date().toISOString();
  }
 }
 cloudWrite(JSON.stringify(next));db=next;
 await cloudFlush();
 closeModal();render();
 if(cloudBlocked||cloudOffline||cloudQueue?.latest!==cloudQueue?.confirmed)
  toast('DNI modificado localmente, pero falta confirmar la nube. No cargues abonos todavía.','error');
 else toast('Número de identidad corregido y guardado en el cliente y su ficha completa.');
}
document.addEventListener('click',event=>{
 const button=event.target.closest?.('[data-contract-dni-edit]');
 if(!button)return;
 event.preventDefault();event.stopImmediatePropagation();
 contractDniEditOpen(button.dataset.contractDniEdit);
},true);
document.addEventListener('submit',event=>{
 if(event.target.id!=='contract-dni-edit-form')return;
 event.preventDefault();event.stopImmediatePropagation();
 contractDniEditSave(event.target).catch(e=>toast(e.message,'error'));
},true);
