// LOTIGEST · Contratos primero: del documento a la ficha del cliente.
// Nunca convierte "prima pactada" en un pago recibido. OCR y validación son revisables.
let contractIntakeWorking=null;
function contractIntakeAdmin(){
 return cloudReady&&cloudUser?.role==='admin'&&sessionStorage.getItem(SESSION)==='yes'&&navigator.onLine!==false&&!cloudBusy&&!cloudBlocked&&!cloudQueue?.pending&&cloudQueue?.latest===cloudQueue?.confirmed;
}
function contractIntakeFormatMoney(n){return Number(n||0).toLocaleString('es-HN',{minimumFractionDigits:2,maximumFractionDigits:2});}
function contractIntakeRememberExtras(form){
 if(!form||!contractIntakeWorking)return;
 if(contractIntakeWorking.mode==='manual')contractTotalsApply(form);
 const data=contractIntakeData(form);
 if(contractIntakeWorking.mode==='manual'){
  data.primaPaid=form.querySelector('[name="primaPaid"]')?.checked?'on':'off';
  // Conservar la prima vigente al pasar de un solar a varios.
  if(!(contractIntakeWorking.extraLots||[]).length)data.solarDown_0=data.down;
 }
 if(contractIntakeWorking.mode==='manual'&&data.lotId!==contractIntakeWorking.values.lotId){
  const lot=getLot(data.lotId);
  data.solarPrice_0=lot?.price??'';
  data.down=lot?.quotePrima??lot?.pdfPrima??lot?.defaultDownPayment??lot?.downPayment??lot?.prima??'';
  data.solarDown_0=data.down;
  if(lot&&!data.months)data.months=lot.quoteMonths??'';
 }
 contractIntakeWorking.extraLots=(contractIntakeWorking.extraLots||[]).map((old,i)=>{
  const id=data['extraLotId_'+i]||'',lot=getLot(id),changed=id!==old.lotId;
  if(contractIntakeWorking.mode==='manual'&&changed){
   data['solarPrice_'+(i+1)]=lot?.price??'';
   data['solarDown_'+(i+1)]=lot?.quotePrima??lot?.pdfPrima??lot?.defaultDownPayment??lot?.downPayment??lot?.prima??'';
  }
  return {...old,stage:data['extraStage_'+i]||'',lotId:id,
   ...(lot?{block:lot.block,number:String(lot.sourceNumber||lot.number||'')}:{}),
   price:data['solarPrice_'+(i+1)]??'',down:data['solarDown_'+(i+1)]??''};
 });
 contractIntakeWorking.values={...contractIntakeWorking.values,...data};
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

// Quitar un solar SOLO de la selección de Nuevo contrato. No toca db, lotes,
// ventas, pagos ni contratos existentes. Si hay otros solares seleccionados,
// uno de ellos pasa a ser el principal para no perder el resto del contrato.
function contractIntakeRemovePrimaryDraft(draft,lotById){
 const values=draft.values||{},extras=Array.isArray(draft.extraLots)?draft.extraLots:[];
 const keep=extras.findIndex(row=>row.lotId&&lotById(row.lotId));
 const promoted=keep<0?null:extras.splice(keep,1)[0];
 const lot=promoted?lotById(promoted.lotId):null;
 draft.selectedLotId=lot?.id||'';
 values.lotId=lot?.id||'';
 values.stage=lot?String(lot.stage):String(values.stage||'');
 values.block=lot?String(lot.block||''):String(values.block||'');
 values.number=lot?String(lot.sourceNumber||lot.number||''):'';
 values.solarPrice_0=lot?String(promoted.price??lot.price??''):'';
 values.solarDown_0=lot?String(promoted.down??''):'';
 values.down=lot?String(promoted.down??''):'';
 delete values.lots;
 for(const key of Object.keys(values)){
  if(/^extra(?:Stage|LotId)_\d+$/.test(key)||/^solar(?:Price|Down)_[1-9]\d*$/.test(key))delete values[key];
 }
 extras.forEach((row,i)=>{
  values['extraStage_'+i]=String(row.stage||lotById(row.lotId)?.stage||'');
  values['extraLotId_'+i]=row.lotId||'';
  values['solarPrice_'+(i+1)]=String(row.price??'');
  values['solarDown_'+(i+1)]=String(row.down??'');
 });
 draft.extraLots=extras;
 return lot?.id||null;
}

document.addEventListener('click',event=>{
 const add=event.target.closest?.('[data-contract-intake-add]'),
  remove=event.target.closest?.('[data-contract-intake-remove]'),
  removePrimary=event.target.closest?.('[data-contract-intake-remove-primary]');
 if((!add&&!remove&&!removePrimary)||!contractIntakeWorking||contractIntakeWorking.busy)return;
 if(removePrimary&&contractIntakeWorking.mode!=='manual')return;
 event.preventDefault();event.stopImmediatePropagation();
 contractIntakeRememberExtras(document.getElementById('contract-intake-form'));
 contractIntakeWorking.extraLots??=[];
 if(removePrimary){
  contractIntakeRemovePrimaryDraft(contractIntakeWorking,getLot);
 }else if(add)contractIntakeWorking.extraLots.push({stage:String(contractIntakeWorking.values.stage||''),lotId:'',price:'',down:''});
 else{
  contractIntakeWorking.extraLots.splice(Number(remove.dataset.contractIntakeRemove),1);
  if(contractIntakeWorking.mode==='manual'){
   const v=contractIntakeWorking.values;
   for(const key of Object.keys(v)){
    if(/^extra(?:Stage|LotId)_\d+$/.test(key)||/^solar(?:Price|Down)_[1-9]\d*$/.test(key))delete v[key];
   }
   contractIntakeWorking.extraLots.forEach((row,i)=>{
    v['extraStage_'+i]=row.stage;v['extraLotId_'+i]=row.lotId;
    v['solarPrice_'+(i+1)]=row.price;v['solarDown_'+(i+1)]=row.down;
   });
   if(!contractIntakeWorking.extraLots.length)v.down=v.solarDown_0;
  }
 }
 const review=document.getElementById('contract-intake-review');
 if(review)review.innerHTML=contractIntakeFields();
 if(removePrimary)toast('Solar quitado del contrato en preparación. El terreno sigue en el inventario.');
},true);

function contractIntakeManualCash(number){
 const n=Number(number);
 return Number.isFinite(n)?n.toLocaleString('es-HN',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
}
function contractIntakeManualFields(){
 const draft=contractIntakeWorking, v=draft?.values||{},rid=residence().id;
 const customer=draft?.preferredClientId?getClient(draft.preferredClientId):null;
 const stage=[1,2].includes(Number(v.stage))?String(v.stage):'';
 const eligible=(residenceLots()||[]).filter(l=>l.type!=='private'&&l.status!=='private'&&!db.sales.some(s=>s.lotId===l.id)&&
  !l.pendingContractId&&!(db.contractTexts||[]).some(d=>d.lotId===l.id&&d.status!=='voided')&&
  !activeReservation(l.id)&&(!l.ownerClientId||(customer&&l.ownerClientId===customer.id)));
 const selected=eligible.find(l=>l.id===v.lotId&&String(l.stage)===stage)||null;
 const extra=draft?.extraLots||[];
 const all=[selected,...extra.map(r=>eligible.find(l=>l.id===r.lotId)||null)];
 const multi=extra.length>0;
 const val=(value)=>esc(value??'');
 const hidden=(key,value)=>'<input type="hidden" name="'+key+'" value="'+val(value)+'">';
 const field=(label,key,type='text',required=false,readOnly=false,value=v[key])=>
  '<label class="field-group"><span>'+label+'</span><input type="'+type+'" name="'+key+'" value="'+val(value)+'" '+
  (type==='number'?'min="0" step="'+(key==='months'?'1':'0.01')+'" ':'')+
  (required?'required ':'')+(readOnly?'readonly ':'')+'style="width:100%;min-width:0"></label>';
 const info=['name','identity','phone','address','rtn','maritalStatus','occupation'];
 const person=customer?'<section class="full notice-card lg-contract-customer-loaded">'+
  '<strong>'+val(customer.name)+'</strong>'+
  '<p><b>Identidad:</b> '+val(customer.identity||'No registrada')+
  ' · <b>Teléfono:</b> '+val(customer.phone||'No registrado')+
  ' · <b>Dirección:</b> '+val(customer.address||'No registrada')+'</p>'+
  '<p><b>RTN:</b> '+val(customer.rtn||'No registrado')+
  ' · <b>Estado civil:</b> '+val(customer.maritalStatus||'No registrado')+
  ' · <b>Ocupación:</b> '+val(customer.occupation||'No registrada')+'</p>'+
  '<small>Datos copiados directamente de Clientes. No debes adjuntar documentos ni volver a ingresar esta información; si faltan datos puedes completarlos posteriormente en Clientes.</small></section>'+
  // Un dato faltante se conserva vacío; nunca se toma de la persona anterior.
  info.map(k=>hidden(k,customer[k]??'')).join(''):
  '<div class="full"><strong>Cliente nuevo</strong><p class="sm muted">Solo llena estos datos si todavía no está registrado.</p></div>'+
  field('Nombre completo','name','text',true)+field('Identidad / DNI (opcional, 13 dígitos)','identity')+
  field('Teléfono (opcional, +504 / +1)','phone')+field('Dirección (opcional)','address')+
  ['rtn','maritalStatus','occupation'].map(k=>hidden(k,v[k]||'')).join('');
 const term=Number(v.months)||0;
 const priceValues=[v.solarPrice_0??selected?.price??'',...extra.map((r,i)=>v['solarPrice_'+(i+1)]??r.price??all[i+1]?.price??'')];
 const prices=priceValues.map(n=>n===''?null:Number(n));
 const downs=multi?[v.solarDown_0??v.down,...extra.map((r,i)=>v['solarDown_'+(i+1)]??r.down)]:
  [v.down];
 const total=all.every(Boolean)&&prices.every(n=>n!==null&&Number.isFinite(n)&&n>0)?
  Math.round(prices.reduce((a,b)=>a+b,0)*100)/100:null;
 const prima=downs.length&&downs.every(x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x)))?downs.reduce((a,b)=>a+Number(b),0):null;
 const financed=total!==null&&prima!==null?Math.round((total-prima)*100)/100:null;
 const monthly=financed!==null&&term>0?Math.round(financed/term*100)/100:null;
 const owned=customer?eligible.filter(l=>l.ownerClientId===customer.id):[];
 const stages=[...new Set(eligible.map(l=>Number(l.stage)).filter(n=>n>0))].sort((a,b)=>a-b);
 const blocks=[...new Set(eligible.filter(l=>String(l.stage)===stage).map(l=>String(l.block||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es',{numeric:true}));
 const chosenBlock=String(v.block||selected?.block||'').trim();
 const options=eligible.filter(l=>String(l.stage)===stage&&String(l.block||'').trim()===chosenBlock).sort((a,b)=>{
  const ownedA=customer&&a.ownerClientId===customer.id?0:1,ownedB=customer&&b.ownerClientId===customer.id?0:1;
  return ownedA-ownedB||String(a.block).localeCompare(String(b.block),'es',{numeric:true})||
   String(a.sourceNumber||a.number).localeCompare(String(b.sourceNumber||b.number),'es',{numeric:true});
 }).map(l=>'<option value="'+val(l.id)+'" '+(selected?.id===l.id?'selected':'')+'>'+
  'Bloque '+val(l.block)+' · Solar '+val(l.sourceNumber||l.number||l.id)+
  (customer&&l.ownerClientId===customer.id?' · Asignado a este cliente':'')+'</option>').join('');
 const lots='<label class="field-group"><span>Etapa</span><select name="stage" id="contract-intake-stage" required>'+
  '<option value="">Selecciona etapa</option>'+stages.map(n=>'<option value="'+n+'" '+(stage===String(n)?'selected':'')+'>Etapa '+n+'</option>').join('')+
  '</select></label><label class="field-group"><span>Bloque</span><select name="block" id="contract-intake-block" required>'+
  '<option value="">'+(stage?'Selecciona bloque':'Primero elige una etapa')+'</option>'+
  blocks.map(b=>'<option value="'+val(b)+'" '+(chosenBlock===b?'selected':'')+'>Bloque '+val(b)+'</option>').join('')+
  '</select></label><label class="field-group"><span>Número de solar</span><select name="lotId" id="contract-intake-lot" required>'+
  '<option value="">'+(chosenBlock?'Selecciona solar':'Primero elige bloque')+'</option>'+options+'</select></label><button type="button" class="btn btn-primary lg-contract-consult" data-contract-intake-consult>Consultar</button>'+
  hidden('number',selected?.sourceNumber||selected?.number||'');
 const measures=selected?'<div class="lg-contract-solar-info"><div class="lg-contract-solar-metrics"><strong>Datos del solar · Terrenos y Predios</strong>'+
  '<p><b>Etapa:</b> '+val(selected.stage)+' &nbsp; <b>Bloque:</b> '+val(selected.block)+' &nbsp; <b>Solar:</b> '+val(selected.sourceNumber||selected.number||selected.id)+'</p>'+
  '<p><b>Área:</b> '+val(selected.area||'Sin medida')+' m² &nbsp; <b>Varas²:</b> '+val(selected.areaVaras2||'—')+
  ' &nbsp; <b>Frente:</b> '+val(selected.dimensions?.front||'—')+' &nbsp; <b>Fondo:</b> '+val(selected.dimensions?.depth||'—')+
  ' &nbsp; <b>Izquierdo:</b> '+val(selected.dimensions?.left||'—')+' &nbsp; <b>Derecho:</b> '+val(selected.dimensions?.right||'—')+'</p>'+
  '<small>Medidas automáticas y protegidas; no se modifican al guardar el contrato.</small></div>'+
  '<aside class="lg-contract-base-price"><div class="lg-contract-price-heading"><span>Precio base del solar</span>'+
   '<button type="button" class="lg-contract-remove-primary" data-contract-intake-remove-primary title="Quitar solar de este contrato" aria-label="Quitar este solar del contrato en preparación">'+
   '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v6M14 10v6"/></svg></button></div>'+
   '<strong>'+(Number(selected.price)>0?'L '+contractIntakeManualCash(selected.price):'Sin precio')+'</strong></aside></div>':
  '<div class="lg-contract-solar-info lg-contract-empty">Selecciona la etapa, el bloque y el número de solar para ver sus medidas y precio registrados.</div>';
 const more=extra.map((row,i)=>{
  const idx=i+1,l=all[idx],s=String(row.stage||''),stageOptions=stages.map(n=>'<option value="'+n+'" '+(s===String(n)?'selected':'')+'>Etapa '+n+'</option>').join('');
  const assigned=new Set(all.filter((item,j)=>item&&j!==idx).map(item=>item.id));
  const lotOptions=eligible.filter(item=>String(item.stage)===s&&!assigned.has(item.id)).sort((a,b)=>
   String(a.block).localeCompare(String(b.block),'es',{numeric:true})||
   String(a.sourceNumber||a.number||a.id).localeCompare(String(b.sourceNumber||b.number||b.id),'es',{numeric:true})).map(item=>
   '<option value="'+val(item.id)+'" '+(l?.id===item.id?'selected':'')+'>Bloque '+val(item.block)+' · Solar '+val(item.sourceNumber||item.number||item.id)+'</option>').join('');
  return '<fieldset class="full" style="border:1px solid var(--line,#cbd5d1);border-radius:12px;padding:12px"><legend>Solar '+(idx+1)+'</legend>'+
   '<div class="form-grid"><label class="field-group"><span>Etapa</span><select name="extraStage_'+i+'" required><option value="">Etapa</option>'+stageOptions+'</select></label>'+
   '<div class="field-group" data-contract-lot-search-group><label for="contract-lot-search-'+i+'"><strong>Bloque y solar</strong></label>'+
   '<input type="search" id="contract-lot-search-'+i+'" data-contract-lot-search autocomplete="off" placeholder="Escribe bloque C, solar 8 o C 8" aria-controls="contract-lot-results-'+i+'" style="width:100%;min-width:0">'+
   '<div id="contract-lot-results-'+i+'" data-contract-lot-results aria-label="Solares disponibles" style="max-height:240px;overflow-y:auto;display:grid;gap:4px" hidden></div>'+
   '<select name="extraLotId_'+i+'" aria-label="Seleccionar bloque y solar" required><option value="">Selecciona solar</option>'+lotOptions+'</select></div>'+
   field('Precio acordado de este solar (L)','solarPrice_'+idx,'number',true,false,v['solarPrice_'+idx]??row.price??l?.price??'')+
   field('Prima pactada de este solar (L)','solarDown_'+idx,'number',true,false,v['solarDown_'+idx]??row.down??'')+
   '<div class="field-group"><span>Precio registrado en Predios</span><strong>'+ (l&&Number(l.price)>0?'L '+contractIntakeManualCash(l.price):'Sin precio registrado')+'</strong></div></div>'+
   '<button type="button" class="btn btn-outline btn-sm" data-contract-intake-remove="'+i+'">Quitar solar</button></fieldset>';
 }).join('');
 const inventoryTotal=all.every(Boolean)&&all.every(l=>Number(l.price)>0)?all.reduce((n,l)=>n+Number(l.price),0):null;
 const priceLabel=total===null?(multi&&all.some(l=>!l)?'Selecciona los solares adicionales':'Completa el precio acordado'):'L '+contractIntakeManualCash(total);
 const finText=financed===null?'—':'L '+contractIntakeManualCash(financed),monthlyText=monthly===null?'—':'L '+contractIntakeManualCash(monthly);
 // Identificación de solo lectura: siempre deriva de los solares seleccionados.
 const termsLots='<div class="notice-card" aria-label="Solares de este contrato" style="margin-bottom:14px;padding:12px;display:grid;gap:8px;overflow-wrap:anywhere">'+
  all.map((lot,i)=>'<div><strong>Solar '+(i+1)+(i===0&&multi?' · Principal':'')+'</strong><div>'+
   (lot?'Etapa '+val(lot.stage)+' · Bloque '+val(lot.block||'—')+' · Solar '+val(lot.sourceNumber||lot.number||lot.id):
    'Pendiente de seleccionar')+'</div></div>').join('')+'</div>';
 const finances=termsLots+'<div class="lg-contract-terms-grid"><div class="lg-contract-term-fields">'+
  field(multi?'Precio de venta del primer solar (L) · Editable':'Precio de venta (L) · Editable','solarPrice_0','number',true,false,v.solarPrice_0??selected?.price??'')+
  (multi?field('Prima del primer solar (L)','solarDown_0','number',true,false,v.solarDown_0??v.down??'')+
    hidden('down',prima??''):field('Prima (L) · Editable','down','number',true,false,v.down??selected?.quotePrima??selected?.pdfPrima??selected?.defaultDownPayment??selected?.downPayment??selected?.prima??''))+
  '<label class="field-group"><span>Plazo (meses)</span><input type="number" name="months" min="1" max="360" step="1" required value="'+val(v.months??'')+'"></label></div>'+
  '<aside class="lg-contract-calc"><h4>Cálculo automático · 0 % interés</h4>'+
  '<div class="lg-contract-calc-row"><span>Precio del contrato</span><strong id="contract-auto-price">'+priceLabel+'</strong></div>'+
  '<div class="lg-contract-calc-row"><span>Saldo a financiar</span><strong id="contract-auto-financed">'+finText+'</strong></div>'+
  '<div class="lg-contract-calc-row lg-contract-payment-row"><span>Cuota mensual</span><strong id="contract-auto-monthly">'+monthlyText+'</strong></div>'+
  '<small>El precio original de Predios ('+(inventoryTotal===null?'sin registrar':'L '+contractIntakeManualCash(inventoryTotal))+') no cambia si modificas las condiciones de este contrato.</small></aside></div>'+
  '<input type="hidden" name="price" value="'+val(total??'')+'">'+
  '<input type="hidden" name="financed" value="'+val(financed??'')+'">'+
  '<input type="hidden" name="monthly" value="'+val(monthly??'')+'">';
 const payment='<details class="full" '+(v.primaPaid==='on'||v.primaReceivedTotal!=null&&v.primaReceivedTotal!==''?'open':'')+'><summary>¿Ya recibió la prima? (opcional)</summary>'+
  '<p class="sm muted">Solo marca la casilla si ya recibiste el dinero; el monto pactado por sí solo no es un cobro.</p>'+
  '<label><input type="checkbox" name="primaPaid" value="on" '+(v.primaPaid==='on'?'checked':'')+'> Registrar prima realmente pagada</label>'+
  '<div class="form-grid">'+field('Monto total de prima recibida (L)','primaReceivedTotal','number',false,false,v.primaReceivedTotal??'')+
  '<div class="full notice-card" aria-live="polite"><strong>Distribución según las primas pactadas</strong>'+
  '<div id="contract-prima-distribution" style="white-space:pre-line;overflow-wrap:anywhere">'+val(contractIntakePrimaPreview(all,downs,v.primaReceivedTotal))+'</div></div>'+
  field('Fecha real del pago','primaDate','date')+
  '<label class="field-group"><span>Método</span><select name="primaMethod">'+
  ['Efectivo','Transferencia','Tarjeta'].map(m=>'<option '+((v.primaMethod||'Efectivo')===m?'selected':'')+'>'+m+'</option>').join('')+
  '</select></label>'+'<label class="field-group"><span>Correlativo del recibo</span><input name="primaRef" inputmode="numeric" maxlength="80" autocomplete="off" placeholder="Ej. 00006159" value="'+val(v.primaRef||'')+'"><small>Escribe el correlativo del dinero recibido; se conservan los ceros iniciales.</small></label>'+'</div></details>';
 return '<form id="contract-intake-form" class="lg-contract-form"><p class="lg-contract-lead">Encuentra al cliente, asígnale su solar y revisa el precio. Solo cambia los datos necesarios.</p>'+
  '<section class="lg-contract-step" aria-labelledby="lg-contract-step-client"><h3 id="lg-contract-step-client" class="lg-contract-step-heading"><span>1</span> Buscar cliente</h3>'+
  '<div class="lg-contract-client-layout"><div class="lg-contract-client-search field-group"><label for="contract-intake-client-search">Identidad o nombre del cliente</label>'+
  '<div class="lg-contract-searchbar"><input id="contract-intake-client-search" type="search" autocomplete="off" enterkeyhint="search" placeholder="Escribe identidad o nombre y presiona Enter" aria-label="Buscar cliente por nombre o identidad" value="'+val(draft?.clientQuery||'')+'">'+
  '<button type="button" class="btn btn-primary" data-contract-client-search>Buscar</button></div>'+
  '<div id="contract-intake-client-results" role="status" class="lg-contract-client-results"></div></div>'+
  '<div class="lg-contract-client-card">'+
  (customer?'<strong class="lg-contract-client-title">Cliente ya registrado</strong>':'')+
  (customer?'<button type="button" class="btn btn-outline lg-contract-change-client" data-contract-client-clear>Cambiar cliente</button>':'')+
  hidden('clientId',customer?.id||'')+person+'</div></div></section>'+
  '<section class="lg-contract-step" aria-labelledby="lg-contract-step-lot"><h3 id="lg-contract-step-lot" class="lg-contract-step-heading"><span>2</span> Asignar solar</h3>'+
  '<div class="lg-contract-lot-fields">'+lots+'</div>'+measures+more+
  '<div class="lg-contract-lot-actions"><button type="button" class="btn btn-outline" data-contract-intake-add>+ Agregar otro solar a este contrato</button></div></section>'+
  '<section class="lg-contract-step" aria-labelledby="lg-contract-step-terms"><h3 id="lg-contract-step-terms" class="lg-contract-step-heading"><span>3</span> Condiciones del contrato</h3>'+finances+'</section>'+
  '<section class="lg-contract-step" aria-labelledby="lg-contract-step-dates"><h3 id="lg-contract-step-dates" class="lg-contract-step-heading"><span>4</span> Fecha del contrato</h3>'+
  '<div class="lg-contract-date-fields">'+field('Fecha del contrato','date','date',true)+field('Fecha de primera cuota','firstDueDate','date')+'</div><p class="sm muted">Primera cuota según el contrato; por defecto un mes después. No se mueve por pagar tarde.</p>'+
  payment+'<details class="lg-contract-notes"><summary>Observaciones (opcional)</summary><textarea name="observations" rows="2" style="width:100%">'+val(v.observations||'')+'</textarea></details></section>'+
  '<div id="contract-intake-alert" role="alert" class="lg-contract-alert"></div></form>';
}
function contractIntakePrimaPreview(lots,downs,amount){
 const valid=lots.every(Boolean)&&downs.every(x=>x!==''&&x!=null&&Number.isFinite(Number(x))&&Number(x)>=0);
 if(!valid)return 'Selecciona los solares y completa la prima de cada uno.';
 const total=downs.reduce((sum,x)=>sum+Math.round(Number(x)*100),0);
 const lines=lots.map((lot,i)=>'Etapa '+lot.stage+' · Bloque '+lot.block+' · Solar '+(lot.sourceNumber||lot.number||lot.id)+': L '+contractIntakeManualCash(Number(downs[i])));
 lines.push('Total pactado: L '+contractIntakeManualCash(total/100));
 if(amount==null||amount==='')lines.push('Ingresa el total realmente recibido.');
 else if(Number(amount)>0&&Math.round(Number(amount)*100)===total)lines.push('El monto coincide. Se registrará la prima de cada solar con el mismo correlativo.');
 else lines.push('El monto recibido no coincide con las primas pactadas. Revisa los importes antes de guardar.');
 return lines.join('\n');
}
// Búsqueda local, sin alterar la selección ni los importes mientras se escribe.
function contractIntakeLotSearchMatches(label,query){
 const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
 const words=norm(query).replace(/[·,;:./-]+/g,' ').split(/\s+/).filter(Boolean);
 if(!words.length)return false;
 const m=norm(label).match(/^BLOQUE\s+(.+?)\s*·\s*SOLAR\s+(.+)$/);
 if(!m)return false;
 const block=m[1],solar=m[2];
 if(words[0]==='BLOQUE'){
  if(words.length===1)return true;
  const rest=words.slice(1),at=rest.indexOf('SOLAR');
  if(at>=0)return block===rest.slice(0,at).join(' ')&&(!rest.slice(at+1).length||solar.startsWith(rest.slice(at+1).join(' ')));
  return block===rest.join(' ')||(rest.length>1&&block===rest[0]&&solar.startsWith(rest.slice(1).join(' ')));
 }
 if(words[0]==='SOLAR')return words.length===1||solar.startsWith(words.slice(1).join(' '));
 if(words.length===1)return block===words[0]||solar.startsWith(words[0]);
 return block===words[0]&&solar.startsWith(words.slice(1).join(' '));
}
function contractIntakeShowLotSearch(input){
 const group=input.closest('[data-contract-lot-search-group]'),select=group?.querySelector('select'),box=group?.querySelector('[data-contract-lot-results]');
 if(!select||!box)return;
 box.replaceChildren();
 const query=input.value.trim();
 box.hidden=!query;box.style.display=query?'grid':'none';
 if(!query)return;
 const matches=Array.from(select.options).filter(option=>option.value&&!option.disabled&&contractIntakeLotSearchMatches(option.textContent,query));
 if(!matches.length){const msg=document.createElement('span');msg.className='sm muted';msg.textContent='No hay solares disponibles para esta búsqueda en la etapa seleccionada.';box.append(msg);return;}
 for(const option of matches){
  const button=document.createElement('button');button.type='button';button.className='btn btn-outline btn-sm';
  button.dataset.contractLotPick=option.value;button.textContent=option.textContent;button.style.textAlign='left';
  box.append(button);
 }
}
// Distribución exacta en centavos; el remanente se asigna por mayor fracción.
function contractSplitCents(total,weights){
 if(!Number.isSafeInteger(total)||total<0||!weights.length||weights.some(w=>!Number.isSafeInteger(w)||w<=0))throw Error('Importes de distribución inválidos.');
 const sum=weights.reduce((n,w)=>n+BigInt(w),0n),amount=BigInt(total);
 const rows=weights.map((w,i)=>({i,value:Number(amount*BigInt(w)/sum),rest:amount*BigInt(w)%sum}));
 let left=total-rows.reduce((n,r)=>n+r.value,0);
 for(const row of [...rows].sort((a,b)=>a.rest===b.rest?a.i-b.i:a.rest>b.rest?-1:1)){if(!left)break;row.value++;left--;}
 return rows.map(r=>r.value);
}
function contractTotalsApply(form){
 const mode=form.elements.namedItem('contractPriceMode'),total=form.elements.namedItem('contractTotalPrice'),prima=form.elements.namedItem('contractTotalPrima');
 if(!mode||!total||!prima)return;
 const count=1+(contractIntakeWorking.extraLots?.length||0),different=mode.value==='different';
 const cents=input=>{const raw=String(input?.value??'').trim(),n=Number(raw),v=Math.round(n*100);return raw!==''&&Number.isFinite(n)&&Number.isSafeInteger(v)&&Math.abs(v/100-n)<0.0000001?v:null;};
 const prices=Array.from({length:count},(_,i)=>form.elements.namedItem('solarPrice_'+i));
 const downs=Array.from({length:count},(_,i)=>form.elements.namedItem(count>1?'solarDown_'+i:'down'));
 for(const input of prices){if(!input)continue;const wrap=input.closest('.field-group');if(wrap)wrap.hidden=!different;input.readOnly=!different;}
 for(const input of downs){const wrap=input?.closest('.field-group');if(wrap)wrap.hidden=true;if(input)input.readOnly=true;}
 total.readOnly=different;total.setCustomValidity('');prima.setCustomValidity('');
 let values=prices.map(cents),priceCents=cents(total),primaCents=cents(prima);
 if(different){priceCents=values.every(v=>v!==null&&v>0)?values.reduce((a,b)=>a+b,0):null;total.value=priceCents===null?'':(priceCents/100).toFixed(2);}
 else if(priceCents!==null&&priceCents>=count)values=contractSplitCents(priceCents,Array(count).fill(1));
 else values=Array(count).fill(null);
 if(priceCents===null||priceCents<count)total.setCustomValidity('Ingresa un precio total positivo con máximo dos decimales.');
 if(primaCents===null||primaCents<0||priceCents===null||primaCents>=priceCents)prima.setCustomValidity('La prima total debe ser igual o mayor que cero y menor que el precio total.');
 const valid=values.every(v=>v!==null&&v>0)&&primaCents!==null&&primaCents>=0&&priceCents!==null&&primaCents<priceCents;
 const allocation=valid?contractSplitCents(primaCents,values):Array(count).fill(null);
 for(let i=0;i<count;i++){
  if(!different&&prices[i])prices[i].value=values[i]===null?'':(values[i]/100).toFixed(2);
  if(downs[i])downs[i].value=allocation[i]===null?'':(allocation[i]/100).toFixed(2);
 }
 const preview=form.querySelector('[data-contract-total-preview]');
 if(preview){preview.replaceChildren();for(let i=0;i<count;i++){
  const row=document.createElement('p'),lot=getLot(form.elements.namedItem(i?'extraLotId_'+(i-1):'lotId')?.value);
  row.textContent='Solar '+(i+1)+(lot?' · Etapa '+lot.stage+' · Bloque '+lot.block+' · '+(lot.sourceNumber||lot.number||lot.id):' · Pendiente de seleccionar')+' · Precio: '+(values[i]===null?'—':'L '+contractIntakeManualCash(values[i]/100))+' · Prima: '+(allocation[i]===null?'—':'L '+contractIntakeManualCash(allocation[i]/100));preview.append(row);
 }}
}
function contractTotalsMount(form,lots){
 const values=contractIntakeWorking.values||{},box=document.createElement('section');box.className='notice-card full';box.dataset.contractTotals='true';
 box.innerHTML='<h3>Total del contrato</h3><div class="form-grid"><label class="field-group"><span>Cómo acordar los precios</span><select name="contractPriceMode"><option value="equal">Precio total · repartir entre los solares</option><option value="different">Precios diferentes por solar</option></select></label><label class="field-group"><span>Precio total acordado (L)</span><input type="number" name="contractTotalPrice" min="0.01" step="0.01" required></label><label class="field-group"><span>Prima total pactada (L)</span><input type="number" name="contractTotalPrima" min="0" step="0.01" required></label></div><p>La prima se distribuye proporcionalmente al precio de cada solar. Pactarla no registra un pago.</p><div data-contract-total-preview aria-live="polite"></div>';
 lots.append(box);
 form.elements.namedItem('contractPriceMode').value=values.contractPriceMode||'equal';
 form.elements.namedItem('contractTotalPrice').value=values.contractTotalPrice??'';
 form.elements.namedItem('contractTotalPrima').value=values.contractTotalPrima??'';
 const refresh=()=>{contractIntakeManualRecalculate(form);const check=form.querySelector('#cq-reviewed');if(check)check.checked=false;};
 box.addEventListener('input',refresh);box.addEventListener('change',refresh);
 contractIntakeManualRecalculate(form);
}

function contractIntakeManualRecalculate(form){
 if(!form||contractIntakeWorking?.mode!=='manual')return;
 contractTotalsApply(form);
 const get=k=>form.elements.namedItem(k)?.value??'';
 const primary=getLot(get('lotId'));
 const n=Number(get('months')),count=contractIntakeWorking.extraLots?.length||0;
 const entries=[primary,...Array.from({length:count},(_,i)=>getLot(get('extraLotId_'+i)))];
 const prices=entries.map((l,i)=>l?get('solarPrice_'+i):'');
 const price=entries.every(Boolean)&&prices.every(v=>v!==''&&Number.isFinite(Number(v))&&Number(v)>0)?
  Math.round(prices.reduce((t,v)=>t+Number(v),0)*100)/100:null;
 const downs=count?[get('solarDown_0'),...Array.from({length:count},(_,i)=>get('solarDown_'+(i+1)))]:[get('down')];
 const down=downs.every(x=>x!==''&&Number.isFinite(Number(x)))?Math.round(downs.reduce((t,x)=>t+Number(x),0)*100)/100:null;
 const financed=price!==null&&down!==null?Math.round((price-down)*100)/100:null;
 const monthly=financed!==null&&Number.isInteger(n)&&n>0?Math.round(financed/n*100)/100:null;
 const put=(k,value)=>{const el=form.elements.namedItem(k);if(el)el.value=value??'';};
 put('price',price);
 if(count)put('down',down);
 put('financed',financed);put('monthly',monthly);
 // No sobreescribir el precio negociado por el usuario mientras escribe.
 const putText=(id,value)=>{const el=form.querySelector('#'+id);if(el)el.textContent=value;};
 putText('contract-auto-price',price===null?(count&&entries.some(l=>!l)?'Selecciona los solares adicionales':'Ingresa el precio acordado'):'L '+contractIntakeManualCash(price));
 putText('contract-auto-financed',financed===null?'—':'L '+contractIntakeManualCash(financed));
 putText('contract-auto-monthly',monthly===null?'—':'L '+contractIntakeManualCash(monthly));
 putText('contract-prima-distribution',contractIntakePrimaPreview(entries,downs,get('primaReceivedTotal')));
}
// Consultar refresca el solar seleccionado, sin modificar datos del inventario.
document.addEventListener('click',event=>{
 const button=event.target.closest?.('[data-contract-intake-consult]');
 if(!button||contractIntakeWorking?.mode!=='manual')return;
 event.preventDefault();event.stopImmediatePropagation();
 const select=document.getElementById('contract-intake-lot');
 if(!select?.value){const alert=document.getElementById('contract-intake-alert');if(alert)alert.textContent='Primero selecciona etapa, bloque y solar.';return;}
 select.dispatchEvent(new Event('change',{bubbles:true}));
},true);
// Limpiar solamente reinicia el formulario: no elimina clientes, solares ni contratos.
document.addEventListener('click',event=>{
 const button=event.target.closest?.('[data-contract-intake-clear]');
 if(!button||contractIntakeWorking?.mode!=='manual'||contractIntakeWorking.busy)return;
 event.preventDefault();event.stopImmediatePropagation();
 contractIntakeWorking.preferredClientId='';contractIntakeWorking.clientQuery='';
 contractIntakeWorking.extraLots=[];contractIntakeWorking.values={date:contractIntakeLocalToday()};
 const review=document.getElementById('contract-intake-review');
 if(review)review.innerHTML=contractIntakeFields();
},true);
// Enter busca al cliente sin enviar el formulario, y lo selecciona si hay una coincidencia única.
document.addEventListener('keydown',event=>{
 if(event.key==='Enter'&&event.target.matches?.('[data-contract-lot-search]')&&contractIntakeWorking?.mode==='manual'){
  event.preventDefault();event.stopImmediatePropagation();
  const box=event.target.closest('[data-contract-lot-search-group]')?.querySelector('[data-contract-lot-results]');
  const matches=box?.querySelectorAll('[data-contract-lot-pick]')||[];
  if(matches.length===1)matches[0].click();else if(matches.length>1)matches[0].focus();
  return;
 }
 if(event.target.id!=='contract-intake-client-search'||event.key!=='Enter'||contractIntakeWorking?.mode!=='manual')return;
 event.preventDefault();event.stopImmediatePropagation();
 const query=event.target.value||'';
 contractIntakeWorking.clientQuery=query;
 contractIntakeClientSearch(query);
 const matches=document.querySelectorAll('#contract-intake-client-results [data-contract-client-pick]');
 if(matches.length===1)matches[0].click();
 else if(matches.length>1)matches[0].focus();
},true);
function contractIntakeClientSearch(query){
 const box=document.getElementById('contract-intake-client-results'),draft=contractIntakeWorking;
 if(!box||!draft)return;
 const clean=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const q=clean(query).replace(/[\s-]/g,'');
 if(q.length<2){box.innerHTML='<small class="sm muted">Escribe al menos dos caracteres.</small>';return;}
 const results=db.clients.filter(c=>clean(c.name).replace(/\s/g,'').includes(q)||String(c.identity||'').replace(/\D/g,'').includes(q)).slice(0,12);
 box.innerHTML=results.map(c=>'<button class="btn btn-outline btn-sm" type="button" data-contract-client-pick="'+esc(c.id)+'" style="display:block;width:100%;text-align:left;margin:3px 0">'+esc(c.name)+' · '+esc(c.identity||'Sin identidad')+'</button>').join('')||
  '<p class="sm muted">No aparece el cliente. Puedes escribir los datos de uno nuevo.</p>';
}
document.addEventListener('input',event=>{
 if(!contractIntakeWorking||contractIntakeWorking.mode!=='manual')return;
 if(event.target.matches?.('[data-contract-lot-search]')){contractIntakeShowLotSearch(event.target);return;}
 if(event.target.id==='contract-intake-client-search'){
  contractIntakeWorking.clientQuery=event.target.value;contractIntakeClientSearch(event.target.value);return;
 }
 const form=event.target.closest?.('#contract-intake-form');
 if(!form)return;
 if(['down','months','solarPrice_0','primaReceivedTotal'].includes(event.target.name)||/^(?:solarPrice_|solarDown_)/.test(event.target.name))
  contractIntakeManualRecalculate(form);
},true);
document.addEventListener('click',event=>{
 if(!contractIntakeWorking||contractIntakeWorking.mode!=='manual')return;
 const lotPick=event.target.closest?.('[data-contract-lot-pick]');
 if(lotPick){
  const select=lotPick.closest('[data-contract-lot-search-group]')?.querySelector('select');
  const id=lotPick.dataset.contractLotPick;
  if(!select||!Array.from(select.options).some(option=>option.value===id&&!option.disabled))return;
  event.preventDefault();event.stopImmediatePropagation();
  select.value=id;select.dispatchEvent(new Event('change',{bubbles:true}));return;
 }
 const search=event.target.closest?.('[data-contract-client-search]');
 if(search){
  event.preventDefault();event.stopImmediatePropagation();
  const query=document.getElementById('contract-intake-client-search')?.value||'';
  contractIntakeWorking.clientQuery=query;
  contractIntakeClientSearch(query);
  // Un único cliente encontrado se selecciona en este mismo formulario.
  // No abrir el escáner legado ni volver a solicitar fotos.
  const choices=document.querySelectorAll('#contract-intake-client-results [data-contract-client-pick]');
  if(choices.length===1)choices[0].click();
  else if(choices.length>1)choices[0].focus();
  return;
 }
 const choice=event.target.closest?.('[data-contract-client-pick],[data-contract-client-clear]');
 if(!choice)return;
 event.preventDefault();event.stopImmediatePropagation();
 const form=document.getElementById('contract-intake-form');
 if(form)contractIntakeRememberExtras(form);
 const selected=choice.dataset.contractClientPick?getClient(choice.dataset.contractClientPick):null;
 const draft=contractIntakeWorking;
 draft.preferredClientId=selected?.id||'';
 draft.clientQuery='';
 for(const key of ['name','identity','phone','address','rtn','maritalStatus','occupation'])draft.values[key]=selected?.[key]??'';
 // Al cambiar de cliente no arrastrar accidentalmente el terreno ni el precio del anterior.
 Object.assign(draft.values,{lotId:'',block:'',number:'',solarPrice_0:'',down:'',solarDown_0:''});
 draft.extraLots=[];
 if(selected){
  const assigned=residenceLots().filter(l=>l.ownerClientId===selected.id&&!db.sales.some(s=>s.lotId===l.id)&&!l.pendingContractId);
  if(assigned.length===1){
   const l=assigned[0];
   Object.assign(draft.values,{lotId:l.id,stage:String(l.stage),block:l.block,number:String(l.sourceNumber||l.number||''),
    solarPrice_0:l.price??'',down:l.quotePrima??l.pdfPrima??l.defaultDownPayment??l.downPayment??l.prima??''});
  }
 }
 document.getElementById('contract-intake-review').innerHTML=contractIntakeFields();
},true);

function contractIntakeFields(){
 if(contractIntakeWorking?.mode==='manual')return contractIntakeManualFields();
 const c=contractIntakeWorking?.values||{};
 const input=(label,key,type='text',readonly=false)=>'<label class="field-group"><span>'+esc(label)+'</span><input name="'+key+'" type="'+type+'" '+(type==='number'?'step="'+(key==='months'?'1':'any')+'" min="0" ':'')+(key==='identity'?'inputmode="numeric" autocomplete="off" maxlength="19" placeholder="0000 0000 00000" ':'')+(readonly?'readonly ':'')+'value="'+esc(c[key]??'')+'" style="width:100%;min-width:0"></label>';
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
  ['Profesión u oficio','occupation'],['Dirección','address'],['Teléfono (+504 / +1)','phone'],['Bloque leído','block'],['Solar leído','number'],
  ['Área del documento (varas²)','areaVaras','number'],['Área del documento (m²)','areaM2','number'],
  ['Norte','north'],['Sur','south'],['Este','east'],['Oeste','west'],
  ['Precio total de la ficha, todos los solares (L)','price','number'],['Prima total pactada de la ficha (L)','down','number'],
  ['Saldo a financiar (L)','financed','number'],['Cuota del documento (L)','monthly','number'],
  ['Plazo (meses)','months','number'],['Precio por vara² (L)','pricePerVara','number']
 ];
 const extraPicker=contractIntakeExtraFields(rows,c);
 const manual=contractIntakeWorking?.mode==='manual',inventoried=getLot(selectedId);
 const dimensionInfo=manual?'<div class="full notice-card"><strong>Medidas del inventario (automáticas, sin volver a ingresarlas)</strong><p class="sm">'+
  (inventoried?'Área: '+esc(inventoried.area||'Por completar')+' m² · Varas²: '+esc(inventoried.areaVaras2||'Por completar')+
   ' · Frente: '+esc(inventoried.dimensions?.front||'—')+' · Fondo: '+esc(inventoried.dimensions?.depth||'—')+
   ' · Lateral izquierdo: '+esc(inventoried.dimensions?.left||'—')+' · Lateral derecho: '+esc(inventoried.dimensions?.right||'—'):'Primero selecciona el solar para mostrar sus medidas guardadas.')+
  '</p><small>Las medidas y el croquis no se modifican desde este contrato.</small></div>':'';
 const fields=labels.filter(([,key])=>!manual||!['areaVaras','areaM2','pricePerVara'].includes(key))
  .map(([label,key,type])=>input(label,key,type)).join('');
 const dates=manual?'<label class="field-group"><span>Fecha del contrato</span><input type="date" name="date" required value="'+esc(c.date||'')+'"></label>'+
  '<label class="field-group"><span>Fecha de primera cuota</span><input type="date" name="firstDueDate" value="'+esc(c.firstDueDate||'')+'"></label>':'';
 const prima=manual?'<div class="full notice-card"><strong>Registrar prima recibida (opcional)</strong><p class="sm">La prima pactada NO es un pago. Activa esta opción solo si ya recibiste el dinero; se registrará el pago completo de prima de cada solar y aparecerá como pagada en Residenciales y Cobros.</p>'+
  '<label><input type="checkbox" name="primaPaid" value="on" '+(c.primaPaid==='on'?'checked':'')+'> Ya recibí la prima pactada y deseo guardar este cobro</label></div>'+
  '<label class="field-group"><span>Fecha real del pago de prima</span><input type="date" name="primaDate" value="'+esc(c.primaDate||'')+'"></label>'+
  '<label class="field-group"><span>Método de pago</span><select name="primaMethod">'+['Efectivo','Transferencia','Tarjeta'].map(m=>'<option value="'+m+'" '+((c.primaMethod||'Efectivo')===m?'selected':'')+'>'+m+'</option>').join('')+'</select></label>'+
  '<label class="field-group full"><span>Correlativo del recibo</span><input name="primaRef" inputmode="numeric" placeholder="Ej. 00006159" maxlength="80" value="'+esc(c.primaRef||'')+'"></label>':'';
 const areaWarnings=matched.length===1&&Number(matched[0].area)>0&&Number(c.areaM2)>0&&Math.abs(Number(matched[0].area)-Number(c.areaM2))>.02?
 '<p style="color:#965a18"><strong>Medidas distintas:</strong> inventario '+esc(matched[0].area)+' m², documento '+esc(c.areaM2)+' m². Se conservará la medida original; revisa la discrepancia.</p>':'';
 const warning=(!stageChosen?'':matched.length>1?
 '<p style="color:#a35a1b">Hay varios solares con el mismo bloque y número en esta etapa: selecciona el correcto.</p>':
 !matched.length?'<p style="color:#a35a1b">No hay una coincidencia única en la etapa elegida. Corrige bloque o solar del OCR.</p>':'')+areaWarnings;
 return '<form id="contract-intake-form"><p class="sm muted">'+(contractIntakeWorking?.mode==='manual'?'Ingresa los datos de la ficha y elige la etapa y solar exactos. No necesitas subir imágenes.':'El documento debe revisarse antes de confirmar. La etapa no se supone si no aparece en la imagen.')+' No reemplazamos medidas existentes, ventas ni abonos.</p>'+warning+
  '<div class="form-grid">'+clientPicker+stagePicker+pick+dimensionInfo+extraPicker+dates+fields+prima+'</div>'+
  '<label>Observaciones del documento<textarea name="observations" rows="4" style="width:100%">'+esc(c.observations||'')+'</textarea></label>'+
  (contractIntakeWorking?.mode==='manual'?'':'<details><summary>Ver/corregir texto reconocido completo</summary><textarea name="rawText" rows="9" style="width:100%">'+esc(c.rawText||'')+'</textarea></details>')+
  '<div id="contract-intake-alert" role="alert">'+(!String(c.name||'').trim()?'<strong>Falta el nombre del cliente.</strong> Corrígelo antes de guardar.':'')+'</div>'+
  '<p class="sm muted">Guardar ficha vincula al cliente con el solar. Si marcas prima recibida, también se crea la venta y un cobro real de prima. Si no la marcas, se conserva pendiente y podrás activar el crédito después.</p></form>';
}
function contractIntakeLocalToday(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
function contractIntakeOpen(clientId='',mode='ocr'){
 if(!contractIntakeAdmin()){toast('Solo el administrador, con datos sincronizados y conexión, puede registrar contratos.','error');return;}
 const existing=clientId?getClient(clientId):null;
 if(clientId&&!existing){toast('No se encontró al cliente seleccionado.','error');return;}
 const manual=mode==='manual';
 contractIntakeWorking={mode:manual?'manual':'ocr',residenceId:residence().id,file:null,preferredClientId:existing?.id||'',values:existing?{
 name:existing.name||'',identity:existing.identity||'',rtn:existing.rtn||'',maritalStatus:existing.maritalStatus||'',
 occupation:existing.occupation||'',address:existing.address||'',phone:existing.phone||''
 }:{},readVersion:0,busy:false};
 if(manual){contractIntakeWorking.values.date=contractIntakeLocalToday();if(contractQuickDefaults?.residenceId===residence().id){contractIntakeWorking.values.stage=contractQuickDefaults.stage;contractIntakeWorking.values.months=contractQuickDefaults.months;}}
 const content=manual?
  '<div id="contract-intake-review">'+contractIntakeFields()+'</div>':
  '<p>Primer paso: toma una foto del contrato con la cámara o elige una foto ya guardada en tu teléfono.</p>'+
  '<div class="field-group"><span>Imagen del contrato</span>'+
  '<div role="group" aria-label="Seleccionar fotografía del contrato" style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px">'+
  '<label class="btn btn-primary" style="position:relative;display:inline-flex;align-items:center;justify-content:center;min-height:44px;cursor:pointer;overflow:hidden">📷 Tomar foto'+
  '<input id="contract-intake-camera" type="file" accept="image/*" capture="environment" aria-label="Tomar foto con la cámara" style="position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer"></label>'+
  '<label class="btn btn-outline" style="position:relative;display:inline-flex;align-items:center;justify-content:center;min-height:44px;cursor:pointer;overflow:hidden">🖼️ Elegir de galería'+
  '<input id="contract-intake-file" type="file" accept="image/*" aria-label="Elegir foto de la galería o archivos" style="position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer"></label></div>'+
  '<small class="sm muted">Fotos JPG, PNG o WebP (máximo 12 MB). También puedes elegir una imagen desde Archivos.</small></div>'+
  '<p class="sm muted">El OCR se realiza en tu dispositivo. Luego podrás revisar los datos antes de guardar; la imagen original se almacena de forma privada en LOTIGEST al confirmar.</p>'+
  '<div id="contract-intake-status" role="status"></div><button type="button" id="contract-intake-retry" class="btn btn-outline" hidden>Volver a leer la foto</button><div id="contract-intake-review"></div>';
 showModal(manual?'Nuevo contrato':'Registrar cliente desde contrato',content,
 (manual?'<button type="button" id="contract-intake-clear" class="btn btn-outline" data-contract-intake-clear>Limpiar</button>':'<button type="button" class="btn btn-outline" data-action="close-modal">Cancelar</button>')+'<button type="submit" id="contract-intake-save" form="contract-intake-form" class="btn btn-primary" '+(manual?'':'disabled')+'>'+(manual?'Guardar contrato':'Guardar ficha revisada')+'</button>',
 true,manual?'Cliente → Solar → Precio y prima → Fecha':'Contratos → Cliente → Solares → Abonos');
 if(manual&&typeof document!=='undefined'){
  const modal=document.querySelector('#modal-root .modal');
  modal?.classList.add('lg-contract-modern');
  const header=modal?.querySelector('.modal-header');
  if(header&&!header.querySelector('.lg-contract-brand'))header.insertAdjacentHTML('afterbegin','<div class="lg-contract-brand" aria-label="LOTIGEST"><span class="lg-contract-brand-icon" aria-hidden="true">⌂</span><span><strong>LOTIGEST</strong><small>Sistema de Lotificadora</small></span></div>');
  const back=header?.querySelector('.modal-close');
  if(back){back.textContent='← Volver';back.setAttribute('aria-label','Volver a Contratos');}
 }
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
function contractIntakeImageMime(file){
 const declared=String(file?.type||'').toLowerCase();
 if(['image/jpeg','image/png','image/webp'].includes(declared))return declared;
 if(declared&&declared!=='application/octet-stream')return '';
 const extension=String(file?.name||'').toLowerCase().split('.').pop();
 return {jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'}[extension]||'';
}
async function contractIntakeRead(file){
 const scan=contractIntakeWorking,status=document.getElementById('contract-intake-status'),box=document.getElementById('contract-intake-review'),saveBtn=document.getElementById('contract-intake-save'),retryBtn=document.getElementById('contract-intake-retry');
 if(!scan||!file||!status||!box)return;
 const reviewForm=document.getElementById('contract-intake-form');
 if(reviewForm){const edited=contractIntakeData(reviewForm);scan.values={...scan.values,...edited};scan.preferredClientId=edited.clientId||scan.preferredClientId||'';}
 const version=++scan.readVersion;
 if(!file.size||file.size>12*1024*1024||!contractIntakeImageMime(file)){
  scan.file=null;saveBtn.disabled=true;
  status.textContent='No se pudo adjuntar la foto. Elige una imagen JPG, PNG o WebP de hasta 12 MB desde Cámara, Galería o Archivos.';return;
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
// El cobro total nunca se registra como pago de cada solar. Debe coincidir
// exactamente con la suma de las primas pactadas antes de crear movimientos.
function contractIntakeData(form){
 const values=Object.fromEntries(new FormData(form));
 values.identity=contractIdentityFormat(values.identity);
 for(const key of ['areaVaras','areaM2','price','down','financed','monthly','months','pricePerVara']){
  values[key]=values[key]===undefined||values[key]===''?null:Number(values[key]);
 }
 if(Object.keys(values).some(key=>/^extraLotId_/.test(key))){
  values.lots=[{lotId:values.lotId,stage:values.stage,price:values.solarPrice_0,down:values.solarDown_0},...Object.keys(values).filter(key=>/^extraLotId_/.test(key)).map(key=>{const i=key.split('_')[1];return {lotId:values[key],stage:values['extraStage_'+i],price:values['solarPrice_'+(Number(i)+1)],down:values['solarDown_'+(Number(i)+1)]};})];
 }
 return values;
}
function contractIntakeValidatePrimaReceived(raw,expected){
 if(raw===undefined)return; // Compatibilidad con formularios anteriores sin este campo.
 const amount=Number(raw),cents=Math.round(amount*100);
 if(raw===null||String(raw).trim()===''||!Number.isFinite(amount)||amount<=0||!Number.isSafeInteger(cents)||cents/100!==amount)
  throw Error('Ingresa el monto total de prima realmente recibido, con máximo dos decimales.');
 if(cents!==Math.round(Number(expected)*100))
  throw Error('El monto total recibido no coincide con la suma de las primas pactadas por solar. Revisa la distribución antes de guardar.');
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
   identity:String(data.identity||'').trim(),phone:String(data.phone||'').trim(),address:String(data.address||'').trim(),
   email:'',rtn:String(data.rtn||'').trim(),maritalStatus:String(data.maritalStatus||'').trim(),
   occupation:String(data.occupation||'').trim()};
  state.clients.unshift(created);return created;
 }
 if(normalizeClientLookup(client.name)!==normalizedName)throw Error('El nombre del contrato no coincide con el cliente registrado. Corrige o elige la ficha correcta.');
 if(client.identity&&normalizeClientLookup(client.identity)!==identity)throw Error('El DNI no coincide con el cliente existente.');
 const fields=['identity','phone','address','rtn','maritalStatus','occupation'];
 for(const key of fields){
  if(!String(client[key]||'').trim()&&String(data[key]||'').trim())client[key]=String(data[key]).trim();
 }
 return client;
}
async function contractIntakeStorePhoto(file){
 const key='contrato_'+crypto.randomUUID().replace(/-/g,'');
 const response=await fetch('/api/app/file?key='+encodeURIComponent(key),{
  method:'PUT',credentials:'same-origin',headers:{'Content-Type':contractIntakeImageMime(file)},body:file
 });
 let body={};
 try{body=await response.json();}catch{}
 if(!response.ok)throw Error(body.error||'No se pudo guardar la fotografía original del contrato.');
 return body.key||key;
}
async function contractIntakeSave(form){
 if(form?.classList?.contains('cq-form')&&!contractQuickReadyToSave(form))return;
 const original=contractIntakeWorking,alert=document.getElementById('contract-intake-alert'),button=document.getElementById('contract-intake-save');
 if(!original||!form||original.busy||!contractIntakeAdmin())throw Error('La sesión está ocupada o sin autorización.');
 const data=contractIntakeData(form),quickAgainRequested=Boolean(original.quickAgain);original.quickAgain=false;
 // Para un cliente seleccionado, usar exclusivamente los datos de su ficha.
 // El formulario no exige volver a capturar DNI, dirección ni fotos.
 if(original.mode==='manual'&&data.clientId){
  const existing=db.clients.find(cl=>cl.id===data.clientId);
  if(!existing||existing.id!==original.preferredClientId)
   throw Error('El cliente seleccionado cambió. Vuelve a buscarlo en Clientes.');
  for(const key of ['name','identity','phone','address','rtn','maritalStatus','occupation'])
   data[key]=existing[key]??'';
  data.existingClientVerified=true;
 }
 if(original.mode==='manual'){
  // El precio del inventario sirve como propuesta, pero cada contrato puede
  // negociar su propio precio. Nunca modificar lot.price ni aceptar NaN.
  const entries=Array.isArray(data.lots)&&data.lots.length?data.lots:
   [{lotId:data.lotId,stage:data.stage,price:data.solarPrice_0,down:data.down}];
  const chosen=entries.map(entry=>{
   const lot=db.lots.find(l=>l.id===entry.lotId&&l.residenceId===original.residenceId);
   if(!lot)throw Error('Selecciona un solar válido de Terrenos y Predios.');
   const price=Number(entry.price);
   if(entry.price===null||entry.price===undefined||entry.price===''||!Number.isFinite(price)||
    price<=0||price>1e12||Math.round(price*100)/100!==price)
    throw Error('Indica un precio de venta válido para Etapa '+lot.stage+' · Bloque '+lot.block+' · Solar '+(lot.sourceNumber||lot.number||lot.id)+'.');
   return {lot,price,down:entry.down};
  });
  const cents=v=>Math.round(Number(v)*100);
  if(chosen.some(({down,price})=>down==null||down===''||!Number.isFinite(Number(down))||Number(down)<0||Number(down)>=price))
   throw Error('Revisa la prima de cada solar: debe ser menor que el precio de venta acordado.');
  if(chosen.some(({down})=>Math.round(Number(down)*100)/100!==Number(down)))
   throw Error('La prima debe expresarse en lempiras con máximo dos decimales.');
  const fullPrice=chosen.reduce((total,x)=>total+cents(x.price),0);
  const fullDown=chosen.reduce((total,x)=>total+cents(x.down),0);
  if(!Number.isSafeInteger(fullPrice)||!Number.isSafeInteger(fullDown))throw Error('Importes demasiado grandes.');
  const months=Number(data.months);
  if(!Number.isInteger(months)||months<1||months>360)throw Error('Ingresa el plazo en meses (1 a 360).');
  data.price=fullPrice/100;data.down=fullDown/100;
  data.financed=(fullPrice-fullDown)/100;
  data.monthly=Math.round((fullPrice-fullDown)/months)/100;
  const first=chosen[0].lot;
  Object.assign(data,{lotId:first.id,stage:first.stage,block:first.block,number:String(first.sourceNumber||first.number||'')});
  if(chosen.length>1)data.lots=chosen.map(x=>({lotId:x.lot.id,stage:x.lot.stage,price:x.price,down:Number(x.down)}));
 }
 const received=original.mode==='manual'&&data.primaPaid==='on';
 if(data.date){buyerDate(data.date,'fecha del contrato');if(!data.firstDueDate)data.firstDueDate=contractSuggestedFirstDue(data.date);}
 if(data.firstDueDate&&(!data.date||buyerDate(data.firstDueDate,'primera cuota')<data.date))throw Error('La fecha de la primera cuota no puede ser anterior a la fecha del contrato.');
 if(data.date&&data.date>businessToday())throw Error('La fecha del contrato no puede estar en el futuro.');
 if(received){
  if(!data.date||!data.firstDueDate)throw Error('Para guardar una prima pagada, registra la fecha del contrato y la primera cuota.');
  if(!data.primaDate||buyerDate(data.primaDate,'fecha del pago de prima')<data.date||data.primaDate>businessToday())throw Error('Comprueba la fecha real de la prima. Debe ser posterior al contrato y no futura.');
  if(!['Efectivo','Transferencia','Tarjeta'].includes(data.primaMethod))throw Error('Selecciona un método de pago.');
  if(!(Number(data.down)>0))throw Error('La prima pactada debe ser mayor que cero para registrar el cobro.');
  contractIntakeValidatePrimaReceived(data.primaReceivedTotal,data.down);
  if(!/^\d{1,80}$/.test(String(data.primaRef||'').trim()))throw Error('Ingresa el correlativo numérico del recibo de prima (hasta 80 dígitos).');

 }
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
  let receiptGroup=received&&planned.length>1?'PG-'+crypto.randomUUID():null;
  const receiptRaw=String(data.primaRef||'').trim();
  if(received&&/^\d+$/.test(receiptRaw)){
   const normalize=value=>String(value??'').trim().replace(/^0+(?=\d)/,'');
   const code=normalize(receiptRaw),matches=p=>[p.receiptReference,p.receiptRef,p.originalReceiptRef,p.receiptReferenceNormalized].some(value=>/^\d+$/.test(String(value??'').trim())&&normalize(value)===code);
   const existing=next.payments.filter(matches);
   if((next.ownerPayments||[]).some(matches))throw Error('El correlativo ya pertenece a otro pago; revisa su distribución.');
   if((next.historicalPayments||[]).some(p=>matches(p)||matches({receiptReference:p.sourceRaw?.receiptRef||p.sourceRaw?.folio})))throw Error('El correlativo ya está registrado en el historial de pagos.');
   const compatible=p=>{
    const sale=next.sales.find(s=>s.id===p.saleId),lot=sale&&next.lots.find(l=>l.id===sale.lotId);
    return /^prima\b/i.test(String(p.concept||''))&&!p.voidedAt&&!['voided','cancelled'].includes(p.status)&&sale?.clientId===client.id&&lot?.residenceId===original.residenceId&&p.date===data.primaDate&&p.method===data.primaMethod;
   };
   if(existing.some(p=>!compatible(p)))throw Error('El correlativo ya está registrado en otro pago. Para compartirlo, las primas deben ser del mismo cliente, fecha, método y residencial.');
   if(existing.length){
    const existingIds=new Set(existing.map(p=>p.id)),groups=new Set(existing.map(p=>p.groupId).filter(Boolean));
    if(next.payments.some(p=>groups.has(p.groupId)&&!existingIds.has(p.id)))throw Error('El recibo contiene otros movimientos; revisa su distribución antes de compartir el correlativo.');
    receiptGroup=groups.size===1&&String([...groups][0]).startsWith('PG-')?[...groups][0]:'PG-'+crypto.randomUUID();
    if(!receiptGroup)receiptGroup='PG-'+crypto.randomUUID();
    for(const payment of existing)payment.groupId=receiptGroup;
   }
  }
  const now=new Date().toISOString();
  const savedDocumentIds=[];
  for(const {lot,fields} of planned){
   const target=next.lots.find(l=>l.id===lot.id);
   if(target.ownerClientId&&target.ownerClientId!==client.id)throw Error('Un solar ya está asignado a otro cliente; verifica la identidad.');
   const {rawText:sourceOCR,...structuredFields}=fields;
   // Las claves auxiliares del formulario no forman parte de la descripción.
   for(const k of Object.keys(structuredFields))if(/^(?:extra|solarPrice_|solarDown_|primaPaid$|primaDate$|primaMethod$|primaRef$|primaReceivedTotal$|existingClientVerified$)/.test(k))delete structuredFields[k];
   const record={id:(original.mode==='manual'?'CM-':'OCR-')+crypto.randomUUID(),clientId:client.id,lotId:lot.id,saleId:'',residenceId:original.residenceId,
    title:'FICHA CONTRACTUAL DE '+String(client.name).slice(0,85),pages:original.mode==='manual'?[]:[{number:1,text:String(data.rawText||'').slice(0,50000),confidence:original.values._confidence??null}],
    structured:{...structuredFields,identity:contractIdentityFormat(client.identity),lotId:lot.id,stage:lot.stage??null,
     inventoryPriceAtContract:Number.isFinite(Number(lot.price))&&Number(lot.price)>0?Number(lot.price):null,
     negotiatedPrice:Number(fields.price)!==Number(lot.price),
     monthlyCalculated:Math.round((fields.price-fields.down)/months*100)/100,downPaymentReceived:received},
    ...(groupId?{contractGroupId:groupId,contractLotIds:planned.map(r=>r.lot.id)}:{}),
    ...(key?{documentKey:key,documentMime:contractIntakeImageMime(original.file)}:{}),format:original.mode==='manual'?'manual':'photo+ocr',status:received?'active':'pending-sale',createdAt:now,updatedAt:now};
   next.contractTexts??=[];next.contractTexts.unshift(record);savedDocumentIds.push(record.id);
   if(original.mode==='manual'){
    const v=record.structured;
    for(const [k,value] of Object.entries({areaM2:target.area,areaVaras:target.areaVaras2,pricePerVara:target.priceVara2,north:target.north||target.colindancias?.north||target.dimensions?.north,south:target.south||target.colindancias?.south||target.dimensions?.south,east:target.east||target.colindancias?.east||target.dimensions?.east,west:target.west||target.colindancias?.west||target.dimensions?.west}))if(value!=null&&value!=='')v[k]=value;
   }
   target.ownerClientId=client.id;
   if(received){
    if(!(fields.down>0))throw Error('Todos los solares deben tener una prima positiva si se marca como pagada.');
    const sale={id:'V-'+crypto.randomUUID(),clientId:client.id,lotId:lot.id,type:'credit',
     price:fields.price,downPayment:fields.down,months,date:data.date,firstDueDate:data.firstDueDate,
     openingPaid:0,importedPaidInstallments:0,historical:false,source:'contract-manual',documentId:record.id};
    const payment={id:'P-'+crypto.randomUUID(),saleId:sale.id,date:data.primaDate,amount:fields.down,
     concept:'Prima',method:data.primaMethod,recordedAt:now,
     ...(data.primaRef?{receiptReference:String(data.primaRef).trim(),...(/^\d+$/.test(String(data.primaRef).trim())?{receiptReferenceNormalized:String(data.primaRef).trim().replace(/^0+(?=\d)/,'')}:{} )}:{}),
     ...(receiptGroup?{groupId:receiptGroup}:{})};
    next.sales.unshift(sale);next.payments.unshift(payment);record.saleId=sale.id;
    target.status='sold';target.mapDebtFlag=false;delete target.pendingContractId;
    const residential=next.residences?.find(r=>r.id===target.residenceId);
    if(residential&&target.sourceFeatureKey){
     residential.records??={};residential.records[target.sourceFeatureKey]={...(residential.records[target.sourceFeatureKey]||{}),
      lotId:target.id,block:target.block,status:'sold'};
    }
   }else target.pendingContractId=record.id;
   if(!(Number(target.area)>0)&&Number(fields.areaM2)>0){target.area=Number(fields.areaM2);target.areaMode='manual';target.areaOrigin='contract-reviewed';}
   if(!(Number(target.areaVaras2)>0)&&Number(fields.areaVaras)>0)target.areaVaras2=Number(fields.areaVaras);
   // El precio negociado es exclusivo del contrato. Nunca escribirlo en Predios.
   if(original.mode!=='manual'&&!(Number(target.price)>0))target.price=fields.price;
  }
  // El estado de venta sólo se actualizará al activar el crédito.
  if(typeof ensureContractNumbers==='function')ensureContractNumbers(next);
 cloudWrite(JSON.stringify(next));db=next;
  await cloudFlush();
  if(cloudBlocked||cloudOffline||cloudQueue?.latest!==cloudQueue?.confirmed){
   toast('La ficha se conserva pendiente de sincronizar. Comprueba el indicador de nube antes de ingresar otro contrato.','error');
  }else if(contractIdentityDigits(getClient(client.id)?.identity)!==contractIdentityDigits(data.identity))toast('El servidor confirmó el guardado, pero no aparece el DNI correcto. No registres abonos y revisa Clientes.','error');
  else toast(received?'Contrato, crédito y prima pagada registrados en '+planned.length+' solar(es). Revisa Residenciales y Cobros.':'Ficha y DNI guardados para '+planned.length+' solar(es). Puedes activar cada crédito y registrar los abonos.');
  const quickConfirmed=!cloudBlocked&&!cloudOffline&&cloudQueue?.latest===cloudQueue?.confirmed&&contractIdentityDigits(getClient(client.id)?.identity)===contractIdentityDigits(data.identity);
  const quickAgain=quickConfirmed&&quickAgainRequested;
  if(quickConfirmed&&form.classList?.contains('cq-form')){contractQuickLastClient=client.id;contractQuickDefaults=form.querySelector('#cq-keep-defaults')?.checked?{residenceId:original.residenceId,stage:data.stage,months:data.months}:null;}
  contractIntakeWorking=null;closeModal();render();
  if(quickAgain){contractIntakeOpen('','manual');return;}
  if(!cloudBlocked&&!cloudOffline&&cloudQueue?.latest===cloudQueue?.confirmed&&contractIdentityDigits(getClient(client.id)?.identity)===contractIdentityDigits(data.identity)&&savedDocumentIds.length&&typeof lawyerSheetOpen==='function'){try{lawyerSheetOpen(savedDocumentIds[0]);}catch(err){toast('Contrato guardado. No se abrió la ficha: '+err.message,'error');}}
 }finally{original.busy=false;if(button?.isConnected)button.disabled=false;}
}
// El vencimiento normal se propone desde el contrato, nunca desde un recibo.
function contractSuggestedFirstDue(date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return '';
 const [y,m,d]=date.split('-').map(Number);
 const original=new Date(Date.UTC(y,m-1,d,12));
 if(original.toISOString().slice(0,10)!==date)return '';
 const next=new Date(Date.UTC(y,m,1,12)),last=new Date(Date.UTC(next.getUTCFullYear(),next.getUTCMonth()+1,0,12)).getUTCDate();
 next.setUTCDate(Math.min(d,last));return next.toISOString().slice(0,10);
}
function contractSuggestDueInput(form,changed){
 const date=form?.elements?.date,due=form?.elements?.firstDueDate;if(!date||!due)return;
 if(changed==='firstDueDate'){due.dataset.suggested='';return;}
 const old=due.dataset.suggested;
 if(due.value&&due.value!==old)return;
 const value=contractSuggestedFirstDue(date.value);
 if(value){due.value=value;due.dataset.suggested=value;}
}
document.addEventListener('change',event=>{
 const form=event.target.closest?.('#contract-intake-form,#contract-intake-activate-form');
 if(form&&['date','firstDueDate'].includes(event.target.name))contractSuggestDueInput(form,event.target.name);
},true);
function contractIntakeActivate(id){
 if(!contractIntakeAdmin()){toast('Debes tener sesión de administrador y datos sincronizados.','error');return;}
 const d=(db.contractTexts||[]).find(x=>x.id===id&&x.status==='pending-sale');
 if(!d)return;
 showModal('Activar crédito desde contrato',
  '<p><b>'+esc(getClient(d.clientId)?.name||'Cliente')+'</b> · Etapa '+esc(getLot(d.lotId)?.stage||'sin confirmar')+' · Bloque '+esc(getLot(d.lotId)?.block||'')+' · Solar '+esc(getLot(d.lotId)?.sourceNumber||'')+'</p>'+
  '<p>Precio '+money(d.structured.price)+' · Prima pactada '+money(d.structured.down)+' · '+esc(d.structured.months)+' cuotas. <strong>Prima recibida: L 0.00</strong>; deberás registrarla después desde Abonos.</p>'+
  '<form id="contract-intake-activate-form"><input type="hidden" name="documentId" value="'+esc(id)+'">'+
  '<label>Fecha de contrato<input name="date" type="date" required value="'+esc(d.structured?.date||'')+'"></label>'+
  '<label>Fecha primera cuota<input name="firstDueDate" type="date" required value="'+esc(d.structured?.firstDueDate||contractSuggestedFirstDue(d.structured?.date))+'"></label>'+
  '<p class="sm muted">Confirma las fechas pactadas. Si no existe una fecha especial, se propone un mes después del contrato. La fecha del primer pago no mueve el vencimiento. Al activar se reconoce la deuda, no un pago.</p></form>',
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
 next.sales.unshift(sale);record.saleId=sale.id;record.status='active';record.structured={...record.structured,date,firstDueDate};record.updatedAt=new Date().toISOString();
 target.price=price;target.status='sold';target.mapDebtFlag=false;target.ownerClientId=d.clientId;delete target.pendingContractId;
 const r=next.residences?.find(r=>r.id===target.residenceId);
 if(r&&target.sourceFeatureKey){r.records??={};r.records[target.sourceFeatureKey]={...(r.records[target.sourceFeatureKey]||{}),lotId:target.id,block:target.block,status:'sold'};}
 if(typeof ensureContractNumbers==='function')ensureContractNumbers(next);
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
  '<p>Registra la ficha manualmente, selecciona cada solar y utiliza sus medidas existentes. La prima solo figurará como pagada si guardas un cobro real.</p>'+
  '<button type="button" class="btn btn-primary" data-contract-intake-open="true">Nuevo contrato manual</button> '+ 
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
 if(button.hasAttribute('data-contract-intake-open'))contractIntakeOpen('','manual');
 else contractIntakeActivate(button.dataset.contractIntakeActivate);
},true);
// Etapa manual y datos del OCR: encontrar solar sin usar una etapa adivinada.
document.addEventListener('change',event=>{
 const target=event.target,form=target.closest?.('#contract-intake-form');
 if(!form||!contractIntakeWorking)return;
 if(!['stage','block','number','lotId'].includes(target.name)&&!/^extra(?:LotId|Stage)_/.test(target.name))return;
 contractIntakeRememberExtras(form);
 const data=contractIntakeData(form);
 if(contractIntakeWorking.mode==='manual'&&target.name==='lotId'){
  for(const key of ['solarPrice_0','down','solarDown_0'])data[key]=contractIntakeWorking.values[key];
 }
 if(contractIntakeWorking.mode==='manual'&&/^extra(?:LotId|Stage)_/.test(target.name)){
  for(let i=0;i<(contractIntakeWorking.extraLots||[]).length;i++){
   data['solarPrice_'+(i+1)]=contractIntakeWorking.values['solarPrice_'+(i+1)];
   data['solarDown_'+(i+1)]=contractIntakeWorking.values['solarDown_'+(i+1)];
  }
 }
 if(/^extraStage_/.test(target.name)){
  const idx=Number(target.name.split('_')[1]);
  contractIntakeWorking.extraLots[idx].lotId='';
  if(contractIntakeWorking.mode==='manual'){
   data['extraLotId_'+idx]='';
   data['solarPrice_'+(idx+1)]='';
   data['solarDown_'+(idx+1)]='';
  }
 }
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
 if(contractIntakeWorking.mode==='manual'&&['stage','block'].includes(target.name)){
  Object.assign(contractIntakeWorking.values,{lotId:'',number:'',solarPrice_0:'',down:'',solarDown_0:''});
  if(target.name==='stage')contractIntakeWorking.values.block='';
 }
 const review=document.getElementById('contract-intake-review');
 if(review)review.innerHTML=contractIntakeFields();
},true);
document.addEventListener('change',event=>{
 if(event.target.id==='contract-intake-file'||event.target.id==='contract-intake-camera'){
  const file=event.target.files?.[0];
  event.target.value=''; // Permite elegir o tomar de nuevo la misma foto tras un error.
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
  ['Estado civil','maritalStatus'],['Profesión u oficio','occupation'],['Dirección','address'],['Teléfono','phone'],
  ['Bloque del contrato','block'],['Solar del contrato','number'],['Etapa verificada','stage'],
  ['Área conjunta del documento, varas²','documentAreaVaras'],['Área conjunta del documento, m²','documentAreaM2'],
  ['Área según contrato, varas²','areaVaras'],['Área según contrato, m²','areaM2'],
  ['Norte','north'],['Sur','south'],['Este','east'],['Oeste','west'],
  ['Fecha del contrato','date'],['Fecha primera cuota','firstDueDate'],['Precio del lote (L)','price'],['Prima pactada (L)','down'],['Saldo financiado (L)','financed'],
  ['Cuota pactada (L)','monthly'],['Plazo, cuotas','months'],['Precio por vara² (L)','pricePerVara'],
  ['Observaciones','observations']
 ];
 const list=keys.map(([label,key])=>{
  const value=info[key];if(value===null||value===undefined||value==='')return '';
  return '<div class="detail-line"><span>'+esc(label)+'</span><strong style="white-space:pre-wrap;overflow-wrap:anywhere;text-align:right">'+esc(String(value))+'</strong></div>';
 }).join('');
 const lot=getLot(d.lotId),delta=Number(lot?.area)>0&&Number(info.areaM2)>0&&Math.abs(Number(lot.area)-Number(info.areaM2))>.02?
  '<p style="color:#9b581f"><strong>Medida protegida:</strong> el catastro conserva '+esc(String(lot.area))+' m² aunque el contrato indique '+esc(String(info.areaM2))+' m².</p>':'';
 const measure=lot?'<div class="notice-card"><strong>Medidas automáticas del terreno</strong><p>Área: '+esc(lot.area||'Sin medida')+' m² · Varas²: '+esc(lot.areaVaras2||'—')+
  ' · Frente: '+esc(lot.dimensions?.front||'—')+' · Fondo: '+esc(lot.dimensions?.depth||'—')+
  ' · Izquierdo: '+esc(lot.dimensions?.left||'—')+' · Derecho: '+esc(lot.dimensions?.right||'—')+'</p></div>':'';
 const sale=d.saleId?getSale(d.saleId):null;
 const confirmed=!!sale&&Number(sale.downPayment)>0&&Math.round(paidAmount(sale.id)*100)>=Math.round(Number(sale.downPayment)*100);
 const paidLabel=sale?'<p><strong>'+(confirmed?'💚 Prima pagada':'Prima pendiente / incompleta')+'</strong> · '+esc(String(sale.downPayment))+' L pactados. Verifica los recibos en Abonos.</p>':'';
 return '<section class="card" style="padding:15px;margin-bottom:15px"><h3>Descripción completa del contrato</h3>'+
  '<p><strong>Contrato '+esc(d.number||d.id)+'</strong></p>'+
  '<p class="sm muted">'+(d.format==='manual'?'Ficha ingresada manualmente':'Documento leído y revisado por OCR')+' · Etapa, bloque y solar vinculados al inventario.</p>'+
  (d.contractLotIds?.length>1?'<p><b>Ficha compartida:</b> '+esc(d.contractLotIds.map(id=>{const l=getLot(id);return 'Etapa '+l?.stage+' · Bloque '+l?.block+' · Solar '+(l?.sourceNumber||l?.number||id);}).join('; '))+'. Los importes de abajo corresponden solo a este solar.</p>':'')+list+measure+paidLabel+delta+'<p class="sm muted">La prima del contrato no se registra como pagada al importar. Consulta Abonos para verificar los cobros posteriores.</p>'+
  (d.documentKey?'<a class="btn btn-outline" target="_blank" rel="noopener noreferrer" href="/api/app/file?key='+encodeURIComponent(d.documentKey)+'">Ver fotografía original</a>':'')+
  (d.status!=='voided'?'<button type="button" class="btn btn-outline" data-contract-edit="'+esc(d.id)+'">Editar contrato</button> <button type="button" class="btn btn-outline" data-contract-delete="'+esc(d.id)+'">Eliminar contrato</button>':'')+
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
 const doc=(db.contractTexts||[]).find(x=>x.id===action.dataset.id&&['photo+ocr','manual'].includes(x.format));
 if(doc){event.preventDefault();event.stopImmediatePropagation();toast('Ficha contractual protegida. No se debe reemplazar mediante el editor antiguo.','error');}
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
 if(typeof ensureContractNumbers==='function')ensureContractNumbers(next);
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
  '<label>DNI del titular (opcional, 13 dígitos)<input type="text" name="identity" inputmode="numeric" maxlength="19" autocomplete="off" value="'+esc(contractIdentityFormat(client.identity||doc.structured?.identity||''))+'" placeholder="0000 0000 00000"></label>'+
  '</form>',
  '<button class="btn btn-outline" data-action="close-modal" type="button">Cancelar</button>'+
  '<button class="btn btn-primary" type="submit" form="contract-dni-edit-form">Guardar DNI corregido</button>',true);
}
async function contractDniEditSave(form){
 if(!contractIntakeAdmin())throw Error('La sesión no está disponible o la nube no está sincronizada.');
 const data=Object.fromEntries(new FormData(form));
 const digits=contractIdentityDigits(data.identity);
 if(String(data.identity||'').trim()&&digits.length!==13)throw Error('El DNI debe tener 13 dígitos. Revisa la ficha contractual.');
 const doc=(db.contractTexts||[]).find(d=>d.id===data.documentId&&['photo+ocr','manual'].includes(d.format)&&d.status!=='voided');
 if(!doc)throw Error('No existe la ficha contractual.');
 const client=getClient(doc.clientId);
 if(!client)throw Error('No se encontró al titular del contrato.');
 if(digits&&db.clients.some(c=>c.id!==client.id&&contractIdentityDigits(c.identity)===digits))throw Error('El DNI ya está asignado a otro cliente. Revisa duplicados.');
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
 if(typeof ensureContractNumbers==='function')ensureContractNumbers(next);
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


// Gestión contractual: edición segura, anulación lógica y conservación obligatoria de cobros.
function contractManageRecord(id){
 return (db.contractTexts||[]).find(d=>d.id===id&&['manual','photo+ocr'].includes(d.format)&&d.status!=='voided');
}
let contractManageEditSnapshot=null,contractManageEditBusy=false;
function contractManageTerms(state,doc,data,today){
 const linked=state.sales.filter(s=>s.lotId===doc.lotId||s.id===doc.saleId);
 if(linked.length>1||linked.some(s=>s.lotId!==doc.lotId||s.clientId!==doc.clientId||(doc.saleId&&s.id!==doc.saleId)))throw Error('Revisa la vinculación de la venta antes de editar.');
 const sale=linked[0];
 if(doc.saleId&&!sale)throw Error('No existe la venta vinculada.');
 if(sale&&sale.type!=='credit')throw Error('Las condiciones de una venta de contado requieren revisión contable.');
 const price=Number(data.price),down=Number(data.down),months=Number(data.months);
 if(!String(data.price??'').trim()||!String(data.down??'').trim()||!Number.isFinite(price)||price<=0||!Number.isFinite(down)||down<0||down>=price||!Number.isInteger(months)||months<1||months>360)throw Error('Precio, prima pactada o plazo inválidos.');
 const cents=n=>Math.round(Number(n)*100);
 if([price,down].some(n=>!Number.isSafeInteger(cents(n))||Math.abs(n*100-cents(n))>.00001))throw Error('Los importes solo admiten dos decimales.');
 const date=data.date?buyerDate(data.date,'fecha de contrato'):'',firstDueDate=data.firstDueDate?buyerDate(data.firstDueDate,'primera cuota'):'';
 if(sale&&(!date||!firstDueDate))throw Error('Registra ambas fechas para el contrato activo.');
 if(firstDueDate&&(!date||firstDueDate<date))throw Error('La primera cuota no puede ser anterior al contrato.');
 if(date>today)throw Error('No puedes ingresar una fecha de contrato futura.');
 if(sale){
  const payments=state.payments.filter(p=>p.saleId===sale.id);
  const paid=cents(sale.openingPaid||0)+payments.reduce((n,p)=>n+cents(p.amount),0);
  if(!Number.isSafeInteger(paid)||paid>cents(price))throw Error('El nuevo precio no puede ser inferior a lo ya pagado.');
  if(payments.some(p=>p.date<date))throw Error('La fecha del contrato no puede ser posterior a un recibo existente.');
  const explicitPrima=payments.filter(p=>p.paymentApplication==='prima'||/^prima\b|^abono a prima\b/i.test(p.concept||'')).reduce((n,p)=>n+cents(p.amount),0);
  if(cents(down)<explicitPrima)throw Error('La prima pactada no puede ser menor que la prima ya registrada. Revisa los recibos.');
  if((state.ownerPayments||[]).some(p=>(p.allocations||[]).some(a=>(a.references||[]).some(r=>r.lotId===sale.lotId))))throw Error('Este solar tiene pagos de fichas históricas; requiere conciliación antes de cambiar condiciones.');
 }
 const monthly=Math.round((cents(price)-cents(down))/months)/100;
 return {sale,terms:{price,down,months,financed:(cents(price)-cents(down))/100,monthly,monthlyCalculated:monthly,date,firstDueDate}};
}
// Correct the inventory reference without recreating the sale or its receipts.
function contractRelocationCandidates(state,doc){
 const occupied=new Set((state.sales||[]).map(s=>s.lotId));
 const assigned=new Set((state.contractTexts||[]).filter(d=>d.id!==doc.id&&d.status!=='voided').map(d=>d.lotId));
 const reserved=new Set((state.reservations||[]).filter(r=>!['expired','cancelled','voided'].includes(r.status)).map(r=>r.lotId));
 const requests=new Set((state.clientRequests||[]).filter(r=>!['rejected','cancelled','voided'].includes(r.status)).map(r=>r.lotId));
 return (state.lots||[]).filter(l=>l.residenceId===doc.residenceId&&(l.id===doc.lotId||(
  l.status==='available'&&l.type!=='private'&&!l.ownerClientId&&!l.clientId&&!l.pendingContractId&&!l.contractId&&!l.purchaseFromPlan&&!l.mapDebtFlag&&
  !occupied.has(l.id)&&!assigned.has(l.id)&&!reserved.has(l.id)&&!requests.has(l.id))));
}
function contractRelocateSolar(state,id,newLotId,actor,reason,at){
 const d=(state.contractTexts||[]).find(x=>x.id===id&&x.status!=='voided'),old=state.lots.find(l=>l.id===d?.lotId),target=state.lots.find(l=>l.id===newLotId);
 if(!d||!old||!target||old.residenceId!==d.residenceId||!d.clientId)throw Error('No se pudo identificar el contrato o solar.');
 if(old.id===target.id)return;
 if(!String(actor||'').trim()||!String(reason||'').trim()||String(reason).length>300)throw Error('Indica el motivo de la corrección del solar.');
 if(!contractRelocationCandidates(state,d).some(l=>l.id===target.id))throw Error('El nuevo solar no está disponible o pertenece a otra residencial.');
 if(old.type==='private'||old.status==='private'||(old.ownerClientId&&old.ownerClientId!==d.clientId)||(old.clientId&&old.clientId!==d.clientId)||(old.pendingContractId&&old.pendingContractId!==d.id)||(old.contractId&&old.contractId!==d.id))throw Error('El solar anterior tiene otra asignación; requiere revisión.');
 if(state.contractTexts.some(x=>x.id!==d.id&&x.status!=='voided'&&x.lotId===old.id))throw Error('El solar anterior tiene otro contrato vigente.');
 const linked=state.sales.filter(s=>s.lotId===old.id||s.id===d.saleId||s.documentId===d.id);
 if(linked.length>1||linked.some(s=>s.lotId!==old.id||s.clientId!==d.clientId||(d.saleId&&s.id!==d.saleId))||(d.saleId&&!linked.length)||(d.status==='active'&&!linked.length))throw Error('La venta vinculada requiere revisión.');
 const sale=linked[0],affected=new Set([old.id,target.id]);
 const references=x=>affected.has(x?.lotId)||(x?.lotIds||[]).some(l=>affected.has(l))||(x?.references||[]).some(r=>affected.has(r.lotId))||(x?.allocations||[]).some(a=>affected.has(a.lotId)||(a.references||[]).some(r=>affected.has(r.lotId)))||(sale&&x?.saleId===sale.id);
 for(const key of ['historicalContracts','historicalPayments','ownershipStatements','ownerPayments','cashEntries'])if((state[key]||[]).some(references))throw Error('Existen movimientos históricos o de caja vinculados; requiere conciliación antes de cambiar solar.');
 if((state.reservations||[]).some(r=>(affected.has(r.lotId)||sale&&r.saleId===sale.id)&&!['expired','cancelled','voided'].includes(r.status)))throw Error('Hay una reserva vinculada; revisa antes de cambiar solar.');
 if((state.clientRequests||[]).some(r=>affected.has(r.lotId)&&!['rejected','cancelled','voided'].includes(r.status)))throw Error('Hay una solicitud pendiente asociada al terreno.');
 const residence=state.residences?.find(r=>r.id===d.residenceId);
 for(const l of [old,target]){const map=residence?.records?.[l.sourceFeatureKey];if(map?.lotId&&map.lotId!==l.id)throw Error('La figura del plano corresponde a otro solar.');if(l===target&&map?.status&&map.status!=='available')throw Error('El nuevo solar figura ocupado en el plano.');}
 const describe=l=>({lotId:l.id,stage:l.stage,block:l.block,number:String(l.sourceNumber||l.number||l.id)});
 const previous={...describe(old),status:old.status},after=describe(target),debt=Boolean(old.mapDebtFlag);
 d.lotEditHistory??=[];d.lotEditHistory.push({before:previous,after,reason:String(reason).trim(),by:String(actor),at,saleId:sale?.id||null,paymentIds:state.payments.filter(p=>sale&&p.saleId===sale.id).map(p=>p.id)});
 d.lotId=target.id;
 const p=d.structured??={};Object.assign(p,after);
 for(const key of ['areaM2','areaVaras','pricePerVara','north','south','east','west','documentAreaM2','documentAreaVaras'])delete p[key];
 const geometry={areaM2:target.area,areaVaras:target.areaVaras2,pricePerVara:target.priceVara2,north:target.north||target.colindancias?.north||target.dimensions?.north,south:target.south||target.colindancias?.south||target.dimensions?.south,east:target.east||target.colindancias?.east||target.dimensions?.east,west:target.west||target.colindancias?.west||target.dimensions?.west};
 for(const [k,v] of Object.entries(geometry))if(v!=null&&v!=='')p[k]=v;
 p.inventoryPriceAtContract=Number(target.price)>0?Number(target.price):null;
 p.negotiatedPrice=Number(p.price)!==Number(target.price);
 if(d.contractGroupId)for(const member of state.contractTexts.filter(x=>x.contractGroupId===d.contractGroupId&&x.clientId===d.clientId&&x.residenceId===d.residenceId&&x.status!=='voided')){
  if(Array.isArray(member.contractLotIds))member.contractLotIds=[...new Set(member.contractLotIds.map(x=>x===old.id?target.id:x))];
 }
 if(sale)sale.lotId=target.id;
 for(const k of ['ownerClientId','clientId','pendingContractId','contractId'])delete old[k];
 old.status='available';old.purchaseFromPlan=false;delete old.mapDebtFlag;
 target.ownerClientId=d.clientId;
 if(sale){target.status='sold';target.mapDebtFlag=debt;delete target.pendingContractId;}
 else{target.pendingContractId=d.id;target.status='available';}
 if(residence){residence.records??={};for(const l of [old,target])if(l.sourceFeatureKey){residence.records[l.sourceFeatureKey]={...(residence.records[l.sourceFeatureKey]||{}),lotId:l.id,block:l.block,status:l.status};}}
}
function contractRelocationOptions(doc){
 const choices=contractRelocationCandidates(db,doc),current=choices.find(l=>l.id===doc.lotId);
 const stages=[...new Set(choices.map(l=>String(l.stage??'')))].sort((a,b)=>a.localeCompare(b,'es',{numeric:true}));
 const label=l=>'Etapa '+(l.stage??'—')+' · Bloque '+(l.block||'—')+' · Solar '+(l.sourceNumber||l.number||l.id);
 const option=(value,name,selected=false)=>'<option value="'+esc(value)+'" '+(selected?'selected':'')+'>'+esc(name)+'</option>';
 return '<section class="notice-card" style="margin:12px 0"><strong>Corregir ubicación del contrato</strong><p class="sm muted">Elige el solar correcto de la misma residencial. Se conservan los pagos y las condiciones pactadas.</p>'+
  '<div class="form-grid"><label class="field-group"><span>Etapa</span><select name="relocationStage">'+option('','Todas')+stages.map(x=>option(x,'Etapa '+x,String(current?.stage??'')===x)).join('')+'</select></label>'+
  '<label class="field-group"><span>Bloque</span><select name="relocationBlock">'+option('','Todos')+'</select></label>'+
  '<label class="field-group full"><span>Solar</span><select name="relocationLotId" required>'+choices.map(l=>option(l.id,label(l),l.id===doc.lotId)).join('')+'</select></label></div>'+
  '<small>Actual: '+esc(current?label(current):doc.lotId)+'</small></section>';
}
function contractRelocationFilter(form,changed){
 const doc=contractManageRecord(form.elements.namedItem('documentId')?.value);if(!doc)return;
 const stage=form.elements.namedItem('relocationStage'),block=form.elements.namedItem('relocationBlock'),select=form.elements.namedItem('relocationLotId');if(!stage||!block||!select)return;
 const choices=contractRelocationCandidates(db,doc),current=choices.find(l=>l.id===doc.lotId),before=select.value;
 const within=choices.filter(l=>!stage.value||String(l.stage??'')===stage.value);
 const blocks=[...new Set(within.map(l=>String(l.block||'')))].sort((a,b)=>a.localeCompare(b,'es',{numeric:true}));
 const prior=changed==='relocationStage'?'':block.value||(!changed?String(current?.block||''):'');
 const option=(value,label)=>'<option value="'+esc(value)+'">'+esc(label)+'</option>';
 block.innerHTML=option('','Todos')+blocks.map(b=>option(b,b)).join('');block.value=blocks.includes(prior)?prior:'';
 const filtered=within.filter(l=>!block.value||String(l.block||'')===block.value);
 select.innerHTML=option('','Selecciona un solar')+filtered.map(l=>option(l.id,'Etapa '+(l.stage??'—')+' · Bloque '+(l.block||'—')+' · Solar '+(l.sourceNumber||l.number||l.id))).join('');
 select.value=filtered.some(l=>l.id===before)?before:'';
}
function contractManageEditOpen(id){
 if(!contractIntakeAdmin()){toast('Solo un administrador con sincronización confirmada puede editar contratos.','error');return;}
 const d=contractManageRecord(id);
 if(!d){toast('El contrato no existe o está anulado.','error');return;}
 const lot=getLot(d.lotId),client=getClient(d.clientId),sale=db.sales.find(s=>s.id===d.saleId||s.lotId===d.lotId),v={...(d.structured||{})},financial=!sale||sale.type==='credit';
 if(sale){v.price=sale.price;v.down=sale.downPayment;v.months=sale.months;v.date=v.date||sale.date;v.firstDueDate=v.firstDueDate||sale.firstDueDate||contractSuggestedFirstDue(v.date);}
 contractManageEditSnapshot={id,raw:JSON.stringify(db)};
 const field=(label,key,type='text')=>'<label class="field-group"><span>'+label+'</span><input name="'+key+'" type="'+type+'" '+(type==='number'?'min="0" step="0.01" ':'')+
  'value="'+esc(v[key]??'')+'" style="width:100%;min-width:0"></label>';
 const basic=[['RTN','rtn'],['Estado civil','maritalStatus'],['Profesión u oficio','occupation'],['Dirección','address'],['Teléfono (+504 / +1)','phone'],
  ['Norte','north'],['Sur','south'],['Este','east'],['Oeste','west']].map(([label,key])=>field(label,key)).join('');
 const credit=financial?field('Precio pactado (L)','price','number')+field('Prima pactada (L)','down','number')+
  '<label class="field-group"><span>Plazo (meses)</span><input name="months" type="number" min="1" max="360" step="1" required value="'+esc(v.months??'')+'"></label>'+
  field('Fecha del contrato','date','date')+field('Primera cuota','firstDueDate','date')+(sale&&!d.structured?.firstDueDate?'<p class="sm muted">La ficha no contiene la primera cuota pactada. Vencimiento sugerido sin período especial: '+esc(contractSuggestedFirstDue(v.date))+'. Verifica el documento original antes de guardar.</p>':''):'';
 showModal('Editar contrato',
  '<p><strong>'+esc(client?.name||v.name||'Cliente')+'</strong> · DNI '+esc(client?.identity||v.identity||'')+'</p>'+
  '<p>Etapa '+esc(lot?.stage||'—')+' · Bloque '+esc(lot?.block||'—')+' · Solar '+esc(lot?.sourceNumber||'—')+'</p>'+
  '<p class="sm muted">Las medidas se obtienen del inventario del solar seleccionado. '+(sale&&financial?'Puedes corregir precio, prima pactada, plazo y ambas fechas. Los recibos se conservan; se recalcula la amortización. Fecha de venta registrada: '+esc(sale.date)+'. Los cambios financieros requieren motivo y PIN.':financial?'Puedes corregir precio, prima pactada, fechas y plazo.':'Venta de contado: condiciones financieras protegidas.')+'</p>'+
  '<form id="contract-manage-edit"><input name="documentId" type="hidden" value="'+esc(id)+'">'+contractRelocationOptions(d)+'<div class="form-grid">'+basic+credit+'</div>'+
  '<label class="field-group"><span>Motivo de la corrección de solar o condiciones</span><input name="termsReason" maxlength="300" autocomplete="off"></label><label class="field-group"><span>PIN de administrador (para cambiar solar o condiciones de un contrato activo)</span><input name="termsPin" type="password" inputmode="numeric" maxlength="4" autocomplete="off"></label>'+
  '<label>Observaciones<textarea name="observations" maxlength="5000" rows="3">'+esc(v.observations||'')+'</textarea></label></form>',
  '<button class="btn btn-outline" data-action="close-modal" type="button">Cancelar</button>'+
  '<button class="btn btn-primary" type="submit" form="contract-manage-edit">Guardar cambios</button>',true);
 const form=document.getElementById('contract-manage-edit');if(form)contractRelocationFilter(form);
}
async function contractManageEditSave(form){
 if(contractManageEditBusy)return;
 if(!contractIntakeAdmin())throw Error('La nube debe estar sincronizada y tu usuario debe ser administrador.');
 const data=Object.fromEntries(new FormData(form)),d=contractManageRecord(data.documentId);
 if(!d)throw Error('No existe el contrato o ya fue anulado.');
 const lot=getLot(d.lotId),sale=db.sales.find(s=>s.id===d.saleId||s.lotId===d.lotId),financial=!sale||sale.type==='credit';
 if(!contractManageEditSnapshot||contractManageEditSnapshot.id!==d.id||contractManageEditSnapshot.raw!==JSON.stringify(db))throw Error('Los datos cambiaron. Vuelve a abrir Editar contrato para evitar sobrescribir información.');
 if(!lot)throw Error('El solar vinculado ya no existe.');
 const next=JSON.parse(JSON.stringify(db)),record=next.contractTexts.find(x=>x.id===d.id),p=record.structured||{};
 const newLotId=String(data.relocationLotId??d.lotId);if(!newLotId)throw Error('Selecciona el solar correcto.');
 const moving=newLotId!==d.lotId;let pinConfirmed=false;
 for(const key of ['rtn','maritalStatus','occupation','address','phone','north','south','east','west','observations']){
  const value=String(data[key]||'').trim();
  if(value.length>(key==='observations'?5000:500))throw Error('Campo demasiado largo: '+key);
  p[key]=value;
 }
 if(financial){
  const {sale:target,terms}=contractManageTerms(next,record,data,businessToday());
  const previous={price:target?.price??p.price,down:target?.downPayment??p.down,months:target?.months??p.months,date:target?.date??p.date,firstDueDate:target?.firstDueDate??p.firstDueDate};
  const changed=Object.keys(previous).some(key=>String(previous[key]??'')!==String(terms[key]??''));
  if((target&&changed)||moving){
   const reason=String(data.termsReason||'').trim(),pin=String(data.termsPin||'');
   if(!reason||reason.length>300)throw Error('Indica el motivo de la corrección.');
   if(!/^\d{4}$/.test(pin)||typeof window.lotigestConfirmAdminPin!=='function')throw Error('Introduce el PIN vigente de administrador.');
   contractManageEditBusy=true;
   try{await window.lotigestConfirmAdminPin(pin);
    if(!form.isConnected||!contractIntakeAdmin()||contractManageEditSnapshot?.id!==d.id||contractManageEditSnapshot.raw!==JSON.stringify(db))throw Error('La ventana o los datos cambiaron durante la confirmación. Abre nuevamente el contrato.');
    pinConfirmed=true;
    if(target&&changed){const after={price:terms.price,down:terms.down,months:terms.months,date:terms.date,firstDueDate:terms.firstDueDate};
    record.termsEditHistory??=[];record.termsEditHistory.push({before:previous,after,reason,by:String(cloudUser.name),at:new Date().toISOString()});
    Object.assign(target,{price:terms.price,downPayment:terms.down,months:terms.months,date:terms.date,firstDueDate:terms.firstDueDate});}
   }finally{contractManageEditBusy=false;}
  }
  Object.assign(p,terms);
  p.negotiatedPrice=Number(terms.price)!==Number(lot.price);
 }
 record.structured=p;
 if(moving){
  const reason=String(data.termsReason||'').trim(),pin=String(data.termsPin||'');
  if(!reason||reason.length>300)throw Error('Indica el motivo de la corrección del solar.');
  if(!pinConfirmed){if(!/^\d{4}$/.test(pin)||typeof window.lotigestConfirmAdminPin!=='function')throw Error('Introduce el PIN vigente de administrador.');
   contractManageEditBusy=true;try{await window.lotigestConfirmAdminPin(pin);
    if(!form.isConnected||!contractIntakeAdmin()||contractManageEditSnapshot?.id!==d.id||contractManageEditSnapshot.raw!==JSON.stringify(db))throw Error('Los datos cambiaron durante la confirmación.');
   }finally{contractManageEditBusy=false;}}
  contractRelocateSolar(next,d.id,newLotId,cloudUser.name,reason,new Date().toISOString());
 }
 record.updatedAt=new Date().toISOString();
 if(typeof ensureContractNumbers==='function')ensureContractNumbers(next);
 cloudWrite(JSON.stringify(next));db=next;await cloudFlush();
 closeModal();render();
 if(cloudBlocked||cloudOffline||cloudQueue?.latest!==cloudQueue?.confirmed)
  toast('Contrato modificado localmente; falta confirmar su sincronización.','error');
 else toast(moving?'Solar corregido. Recibos conservados y mapa actualizado.':'Contrato editado. Cuotas y saldo recalculados; recibos y medidas conservados.');
}
// Anular una ficha concreta sin tocar otras ventas ni liberar recibos compartidos.
function contractCancelFinancialRecords(state,id,actor,reason,at){
 const next=JSON.parse(JSON.stringify(state));
 const d=(next.contractTexts||[]).find(x=>x.id===id);
 const lot=next.lots.find(l=>l.id===d?.lotId);
 if(!d||!lot||lot.residenceId!==d.residenceId||!d.clientId)throw Error('No se pudo identificar el contrato y su solar.');
 if(d.status==='voided'&&d.financialCancellation)throw Error('Los pagos de este contrato ya fueron retirados.');
 if(next.contractTexts.some(x=>x.id!==id&&x.status!=='voided'&&x.lotId===lot.id))throw Error('Existe otro contrato vigente para este solar.');
 if((lot.ownerClientId&&lot.ownerClientId!==d.clientId)||(lot.clientId&&lot.clientId!==d.clientId)||lot.type==='private'||lot.status==='private')throw Error('El solar tiene otra asignación. No se retiró ningún pago.');
 const sales=next.sales.filter(s=>s.id===d.saleId||s.documentId===id);
 if(sales.some(s=>s.clientId!==d.clientId||s.lotId!==lot.id)||next.sales.some(s=>s.lotId===lot.id&&!sales.includes(s)))throw Error('Existe una venta no identificada con esta ficha. Revisa antes de anular.');
 if(d.saleId&&!sales.some(s=>s.id===d.saleId))throw Error('La venta original no está disponible.');
 const saleIds=new Set(sales.map(s=>s.id)),payments=next.payments.filter(p=>saleIds.has(p.saleId)),paymentIds=new Set(payments.map(p=>p.id));
 const groups=new Set(payments.map(p=>p.groupId).filter(Boolean));
 if(next.payments.some(p=>!paymentIds.has(p.id)&&groups.has(p.groupId)))throw Error('Hay un recibo compartido con otro contrato. Revisa la distribución antes de anular.');
 const refsOf=x=>x.references||[];
 const touches=refs=>refs.some(r=>r.lotId===lot.id);
 const only=refs=>refs.length>0&&refs.every(r=>r.lotId===lot.id);
 const statements=(next.ownershipStatements||[]).filter(s=>s.clientId===d.clientId&&s.residenceId===d.residenceId&&touches(refsOf(s)));
 if(statements.some(s=>!only(refsOf(s))||(s.paymentIds||[]).length||(s.contractIds||[]).length))throw Error('Hay una ficha histórica o compartida que requiere conciliación manual.');
 const statementIds=new Set(statements.map(s=>s.id));
 const owners=(next.ownerPayments||[]).filter(p=>p.clientId===d.clientId&&p.residenceId===d.residenceId&&(p.allocations||[]).some(a=>statementIds.has(a.statementId)||touches(refsOf(a))));
 if(owners.some(p=>!(p.allocations||[]).every(a=>statementIds.has(a.statementId)&&only(refsOf(a)))))throw Error('Hay un recibo de propietario compartido. No se liberó el correlativo.');
 const ownerIds=new Set(owners.map(p=>p.id));
 if((next.historicalContracts||[]).some(c=>saleIds.has(c.saleId)||(c.clientId===d.clientId&&(c.lotId===lot.id||touches(refsOf(c)))))||
    (next.historicalPayments||[]).some(p=>paymentIds.has(p.postedPaymentId)||(p.clientId===d.clientId&&(p.lotId===lot.id||touches(refsOf(p)))))||
    payments.some(p=>p.historicalImportId))throw Error('Hay pagos históricos vinculados. Requieren conciliación manual antes de anular.');
 if((next.reservations||[]).some(r=>r.lotId===lot.id&&r.status==='active')||
    (next.clientRequests||[]).some(r=>r.lotId===lot.id&&!['rejected','cancelled','voided'].includes(r.status)))throw Error('El solar tiene un apartado o solicitud vigente.');
 // D1 conserva las versiones anteriores de registros eliminados en app_history.
 // El resumen queda en la ficha anulada; los folios no ocupan el índice de recibos.
 const receiptRefs=[...new Set([...payments,...owners].map(p=>String(p.receiptReference||p.receiptReferenceNormalized||p.originalReceiptRef||'')).filter(Boolean))];
 const audit={at,by:actor,reason,saleIds:[...saleIds],paymentIds:[...paymentIds],ownerPaymentIds:[...ownerIds],receiptRefs,amountCents:payments.reduce((n,p)=>n+Math.round(Number(p.amount||0)*100),0)+owners.reduce((n,p)=>n+Number(p.amountCents||0),0)};
 d.financialCancellation=audit;
 d.financialCancellationHistory=[...(d.financialCancellationHistory||[]),audit];
 if(d.status!=='voided')d.statusBeforeVoid=d.status;
 d.status='voided';d.voidedAt=d.voidedAt||at;d.voidedBy=d.voidedBy||actor;d.voidReason=d.voidReason||reason;d.updatedAt=at;
 delete d.saleId;
 next.payments=next.payments.filter(p=>!paymentIds.has(p.id));
 next.sales=next.sales.filter(s=>!saleIds.has(s.id));
 if(next.ownerPayments)next.ownerPayments=next.ownerPayments.filter(p=>!ownerIds.has(p.id));
 if(next.ownershipStatements)next.ownershipStatements=next.ownershipStatements.filter(s=>!statementIds.has(s.id));
 for(const r of next.reservations||[])if(saleIds.has(r.saleId)){r.status='cancelled';r.cancelledAt=at;delete r.saleId;}
 if(lot.ownerClientId===d.clientId)delete lot.ownerClientId;
 if(lot.clientId===d.clientId)delete lot.clientId;
 if(lot.pendingContractId===id)delete lot.pendingContractId;
 if(lot.contractId===id)delete lot.contractId;
 if(lot.pendingContractId||lot.contractId)throw Error('El solar está asociado a otra ficha.');
 lot.status='available';lot.purchaseFromPlan=false;delete lot.mapDebtFlag;
 const map=next.residences?.find(r=>r.id===lot.residenceId)?.records?.[lot.sourceFeatureKey];
 if(map&&(!map.lotId||map.lotId===lot.id))map.status='available';
 return next;
}
let contractCancellationBusy=false;
function contractCancellationRecord(id){
 return (db.contractTexts||[]).find(d=>d.id===id&&['manual','photo+ocr'].includes(d.format)&&!(d.status==='voided'&&d.financialCancellation));
}
function contractManageDeleteOpen(id){
 if(!contractIntakeAdmin()){toast('Solo un administrador puede anular contratos.','error');return;}
 const d=contractCancellationRecord(id);if(!d){toast('El contrato no existe o sus pagos ya fueron retirados.','error');return;}
 showModal('Anular contrato y liberar recibos',
  '<p>Contrato <strong>'+esc(d.number||d.id)+'</strong> de '+esc(getClient(d.clientId)?.name||'cliente')+'.</p>'+
  '<p><strong>Se retirarán las primas y abonos de este contrato, se liberarán sus correlativos y el solar, y se actualizarán los totales.</strong> Solo realiza esta acción si los registros deben revertirse. Se conserva la auditoría. Si hay dinero realmente recibido, concilia su devolución o aplicación antes de anular.</p>'+
  '<p>Los recibos compartidos o históricos requieren revisión. Reactivar la ficha no restaurará los recibos retirados.</p>'+
  '<form id="contract-manage-delete"><input type="hidden" name="documentId" value="'+esc(id)+'"><label>Escribe ELIMINAR para confirmar<input name="confirmation" required autocomplete="off"></label>'+
  '<label>Motivo de la anulación<textarea name="reason" maxlength="300" rows="2" required></textarea></label>'+
  '<label>PIN de administrador<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required autocomplete="off"></label></form>',
  '<button class="btn btn-outline" type="button" data-action="close-modal">Cancelar</button>'+
  '<button class="btn btn-primary" type="submit" form="contract-manage-delete">Confirmar anulación</button>',true);
}
async function contractManageDeleteSave(form){
 if(contractCancellationBusy)return;
 if(!contractIntakeAdmin())throw Error('Solo un administrador con nube sincronizada puede anular.');
 const data=Object.fromEntries(new FormData(form));
 if(String(data.confirmation||'').trim().toUpperCase()!=='ELIMINAR')throw Error('Escribe ELIMINAR para confirmar.');
 const reason=String(data.reason||'').trim(),pin=String(data.pin||'');
 if(!reason||reason.length>300)throw Error('Indica el motivo de la anulación.');
 if(!/^\d{4}$/.test(pin)||typeof window.lotigestConfirmAdminPin!=='function')throw Error('Introduce el PIN vigente de administrador.');
 const d=contractCancellationRecord(data.documentId);if(!d)throw Error('Contrato inexistente o ya procesado.');
 const snapshot=JSON.stringify(db);
 contractCancellationBusy=true;
 try{
  await window.lotigestConfirmAdminPin(pin);
  if(!contractIntakeAdmin()||form.isConnected===false||snapshot!==JSON.stringify(db))throw Error('Los datos cambiaron. Abre nuevamente el contrato.');
  const next=contractCancelFinancialRecords(db,d.id,String(cloudUser?.name||'Administrador'),reason,new Date().toISOString());
  if(typeof ensureContractNumbers==='function')ensureContractNumbers(next);
  cloudWrite(JSON.stringify(next));db=next;await cloudFlush();closeModal();render();
  if(cloudBlocked||cloudOffline||cloudQueue?.latest!==cloudQueue?.confirmed)
   toast('Anulación pendiente de sincronizar. No reutilices los correlativos hasta confirmar la nube.','error');
  else toast('Contrato anulado. Recibos retirados, correlativos y solar liberados.');
 }finally{contractCancellationBusy=false;}
}
document.addEventListener('click',event=>{
 const edit=event.target.closest?.('[data-contract-edit]'),del=event.target.closest?.('[data-contract-delete]');
 if(!edit&&!del)return;
 event.preventDefault();event.stopImmediatePropagation();
 if(edit)contractManageEditOpen(edit.dataset.contractEdit);
 else contractManageDeleteOpen(del.dataset.contractDelete);
},true);
document.addEventListener('change',event=>{const form=event.target.closest?.('#contract-manage-edit');if(form&&['relocationStage','relocationBlock'].includes(event.target.name))contractRelocationFilter(form,event.target.name);},true);
document.addEventListener('submit',event=>{
 if(event.target.id==='contract-manage-edit'){
  event.preventDefault();event.stopImmediatePropagation();
  contractManageEditSave(event.target).catch(e=>toast(e.message,'error'));
 }
 if(event.target.id==='contract-manage-delete'){
  event.preventDefault();event.stopImmediatePropagation();
  contractManageDeleteSave(event.target).catch(e=>toast(e.message,'error'));
 }
},true);

// Three-step manual intake. Existing inputs and the original persistence path are retained.
let contractQuickDefaults=null,contractQuickLastClient=null;
function contractQuickPaint(form){
 const draft=contractIntakeWorking;if(!form||!draft)return;
 const step=Math.max(1,Math.min(3,Number(draft.quickStep)||1));draft.quickStep=step;
 form.dataset.quickStep=String(step);
 for(const panel of form.querySelectorAll('[data-cq-panel]'))panel.hidden=Number(panel.dataset.cqPanel)!==step;
 for(const tab of form.querySelectorAll('[data-cq-step]')){const active=Number(tab.dataset.cqStep)===step;tab.setAttribute('aria-current',active?'step':'false');}
 const modal=form.closest('.modal'),save=modal?.querySelector('#contract-intake-save');if(save)save.hidden=step!==3;
 const next=modal?.querySelector('[data-cq-next]'),back=modal?.querySelector('[data-cq-back]'),again=modal?.querySelector('[data-cq-again]');
 if(next){next.hidden=step===3;next.textContent=step===1?'Elegir solar →':'Revisar contrato →';}if(back)back.hidden=step===1;if(again)again.hidden=step!==3;
 const summary=form.querySelector('.cq-review-summary');
 if(summary){const data=contractIntakeData(form),client=data.clientId?getClient(data.clientId):null;const lots=[getLot(data.lotId),...(draft.extraLots||[]).map((row,i)=>getLot(data['extraLotId_'+i]||row.lotId))].filter(Boolean);
  summary.innerHTML='<strong>'+esc(client?.name||data.name||'Cliente pendiente')+'</strong><span>'+esc(client?.identity||data.identity||'')+'</span><small>'+lots.map(l=>'Etapa '+esc(l.stage)+' · Bloque '+esc(l.block)+' · Solar '+esc(l.sourceNumber||l.id)).join('<br>')+'</small><p>Precio total: <b>'+esc(money(Number(data.price)||0))+'</b></p>';
 }
}
function contractQuickCheckPanel(form,index){
 const panel=form.querySelector('[data-cq-panel="'+index+'"]');
 for(const field of panel?.querySelectorAll('input,select,textarea')||[]){if(field.disabled||field.type==='hidden'||!field.willValidate)continue;if(!field.checkValidity()){contractIntakeWorking.quickStep=index;contractQuickPaint(form);field.reportValidity();field.focus();return false;}}
 return true;
}
function contractQuickReadyToSave(form){
 if(!form.classList.contains('cq-form'))return true;
 const draft=contractIntakeWorking;if(!draft)return false;
 contractIntakeRememberExtras(form);contractIntakeManualRecalculate(form);
 if((draft.quickStep||1)<3){const current=draft.quickStep||1;if(contractQuickCheckPanel(form,current)){draft.quickStep=current+1;contractQuickPaint(form);}return false;}
 for(const step of [1,2,3])if(!contractQuickCheckPanel(form,step))return false;
 if(!form.querySelector('#cq-reviewed')?.checked){toast('Revisa los datos y confirma antes de guardar el contrato.','error');return false;}return true;
}
function contractQuickMount(){
 const form=document.getElementById('contract-intake-form');if(!form||!form.classList.contains('lg-contract-form')||form.classList.contains('cq-form')||contractIntakeWorking?.mode!=='manual')return;
 const panels=[...form.querySelectorAll(':scope > .lg-contract-step')];if(panels.length!==4)return;
 form.classList.add('cq-form');form.noValidate=true;form.closest('.modal')?.classList.add('cq-modal');
 const [client,lots,terms,dates]=panels;client.dataset.cqPanel='1';lots.dataset.cqPanel='2';terms.dataset.cqPanel='3';
 const dateTitle=dates.querySelector('h3');if(dateTitle)dateTitle.textContent='Fechas y opciones';terms.append(...dates.childNodes);dates.remove();
 const residenceCard=document.createElement('div');residenceCard.className='cq-residence-card';residenceCard.innerHTML='<small>Residencial</small><strong>'+esc(residence()?.name||'Residencial actual')+'</strong><span>✓ Solo solares disponibles</span>';lots.querySelector('h3')?.after(residenceCard);
 const price=form.querySelector('[name="solarPrice_0"]')?.closest('.field-group');
 const primaInput=form.querySelector('[name="solarDown_0"]')||form.querySelector('[name="down"]');
 const prima=primaInput?.closest('.field-group')||primaInput;
 const primary=document.createElement('fieldset');primary.className='full cq-primary-solar';
 primary.style.cssText='border:1px solid var(--line,#cbd5d1);border-radius:12px;padding:12px;margin:12px 0';
 const legend=document.createElement('legend');legend.textContent='Solar 1';primary.append(legend);
 const grid=document.createElement('div');grid.className='form-grid';primary.append(grid);
 const lotFields=lots.querySelector('.lg-contract-lot-fields'),metrics=lots.querySelector('.lg-contract-solar-info');
 if(lotFields){lotFields.classList.add('full');grid.append(lotFields);}
 if(metrics){metrics.classList.add('full');grid.append(metrics);}
 if(price){price.classList.add('cq-solar-price');const label=price.querySelector('span');if(label)label.textContent='Precio acordado de este solar (L)';grid.append(price);}
 if(prima){const label=prima.querySelector?.('span');if(label)label.textContent='Prima pactada de este solar (L)';grid.append(prima);}
 residenceCard.after(primary);
 contractTotalsMount(form,lots);
 const nav=document.createElement('nav');nav.className='cq-steps';nav.setAttribute('aria-label','Pasos del contrato');nav.innerHTML=[['1','Cliente'],['2','Solares'],['3','Revisar']].map(([n,label])=>'<button type="button" data-cq-step="'+n+'"><i>'+n+'</i>'+label+'</button>').join('');form.prepend(nav);
 const quick=document.createElement('div');quick.className='cq-client-actions';quick.innerHTML='<button type="button" class="btn btn-outline" data-contract-client-clear>+ Cliente nuevo</button>'+'<button type="button" class="btn btn-outline" data-cq-last-client '+(contractQuickLastClient&&getClient(contractQuickLastClient)?'':'disabled')+'>Usar último cliente</button>';client.append(quick);
 const summary=document.createElement('div');summary.className='cq-review-summary';terms.querySelector('h3')?.after(summary);
 const review=document.createElement('div');review.className='cq-review-check';review.innerHTML='<p>La prima pactada no registra un pago. Usa la opción de prima recibida solo si ya cobraste el dinero.</p><label><input type="checkbox" id="cq-reviewed" required> He revisado los datos del contrato.</label><label><input type="checkbox" id="cq-keep-defaults"> Conservar residencial, etapa y plazo para el siguiente contrato.</label>';terms.append(review);
 const footer=form.closest('.modal')?.querySelector('.modal-footer');if(footer){footer.querySelectorAll('[data-cq-back],[data-cq-next],[data-cq-again]').forEach(el=>el.remove());const back=document.createElement('button');back.type='button';back.className='btn btn-outline';back.dataset.cqBack='true';back.textContent='← Atrás';const next=document.createElement('button');next.type='button';next.className='btn btn-primary';next.dataset.cqNext='true';const again=document.createElement('button');again.type='button';again.className='btn btn-outline';again.dataset.cqAgain='true';again.textContent='Guardar y crear otro';footer.prepend(back,next);footer.append(again);}
 form.addEventListener('input',e=>{if(e.target.id==='cq-reviewed'||e.target.id==='cq-keep-defaults')return;const check=form.querySelector('#cq-reviewed');if(check)check.checked=false;});
 form.addEventListener('change',e=>{if(e.target.id==='cq-reviewed'||e.target.id==='cq-keep-defaults')return;const check=form.querySelector('#cq-reviewed');if(check)check.checked=false;contractQuickPaint(form);});
 contractQuickPaint(form);
}
setTimeout(()=>{
 const root=document.getElementById('modal-root');if(root)new MutationObserver(contractQuickMount).observe(root,{childList:true,subtree:true});contractQuickMount();
 document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-cq-step],[data-cq-back],[data-cq-next],[data-cq-again],[data-cq-last-client]');if(!button)return;
  const form=document.getElementById('contract-intake-form'),draft=contractIntakeWorking;if(!form||!draft||draft.busy)return;event.preventDefault();event.stopImmediatePropagation();
  const step=Number(draft.quickStep)||1;
  if(button.hasAttribute('data-cq-last-client')){if(window.confirm('¿Usar el último cliente y reiniciar este borrador?'))contractIntakeOpen(contractQuickLastClient,'manual');return;}
  if(button.hasAttribute('data-cq-again')){if(contractQuickReadyToSave(form)){draft.quickAgain=true;form.requestSubmit();}return;}
  contractIntakeRememberExtras(form);contractIntakeManualRecalculate(form);
  const target=button.hasAttribute('data-cq-step')?Number(button.dataset.cqStep):button.hasAttribute('data-cq-back')?step-1:step+1;
  if(target>step)for(let i=step;i<target;i++)if(!contractQuickCheckPanel(form,i))return;
  draft.quickStep=Math.max(1,Math.min(3,target));contractQuickPaint(form);form.closest('.modal-content')?.scrollTo?.({top:0,behavior:'smooth'});
 },true);
},0);
