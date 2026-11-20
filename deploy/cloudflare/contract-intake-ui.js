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
 const person=customer?'<section class="full notice-card"><strong>'+val(customer.name)+'</strong><p>DNI: '+val(customer.identity||'Pendiente')+
  ' · Tel.: '+val(customer.phone||'Sin teléfono')+' · Dirección: '+val(customer.address||'Sin dirección')+'</p>'+
  '<small>Datos recuperados de Clientes; no se creará una persona duplicada.</small></section>'+
  info.map(k=>{
   const saved=customer[k]||v[k]||'';
   return (k==='identity'&&!saved)?field('Completar identidad del cliente','identity','text',true,false,''):
    (['phone','address'].includes(k)&&!saved?field(k==='phone'?'Teléfono':'Dirección',k,'text',false,false,''):
    hidden(k,saved));
  }).join(''):'<div class="full"><strong>Cliente nuevo</strong><p class="sm muted">Solo llena estos datos si todavía no está registrado.</p></div>'+
  field('Nombre completo','name','text',true)+field('Identidad / DNI (13 dígitos)','identity','text',true)+
  field('Teléfono (+504 / +1)','phone')+field('Dirección','address')+
  ['rtn','maritalStatus','occupation'].map(k=>hidden(k,v[k]||'')).join('');
 const term=Number(v.months)||0;
 const prices=all.map(l=>Number(l?.price)||0);
 const downs=multi?[v.solarDown_0,...extra.map((r,i)=>v['solarDown_'+(i+1)]??r.down)]:
  [v.down];
 const total=all.every(Boolean)&&prices.every(n=>n>0)?prices.reduce((a,b)=>a+b,0):null;
 const prima=downs.length&&downs.every(x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x)))?downs.reduce((a,b)=>a+Number(b),0):null;
 const financed=total!==null&&prima!==null?Math.round((total-prima)*100)/100:null;
 const monthly=financed!==null&&term>0?Math.round(financed/term*100)/100:null;
 const owned=customer?eligible.filter(l=>l.ownerClientId===customer.id):[];
 const stages=[...new Set(eligible.map(l=>Number(l.stage)).filter(n=>n>0))].sort((a,b)=>a-b);
 const options=eligible.filter(l=>String(l.stage)===stage).sort((a,b)=>{
  const ownedA=customer&&a.ownerClientId===customer.id?0:1,ownedB=customer&&b.ownerClientId===customer.id?0:1;
  return ownedA-ownedB||String(a.block).localeCompare(String(b.block),'es',{numeric:true})||
   String(a.sourceNumber||a.number).localeCompare(String(b.sourceNumber||b.number),'es',{numeric:true});
 }).map(l=>'<option value="'+val(l.id)+'" '+(selected?.id===l.id?'selected':'')+'>'+
  'Bloque '+val(l.block)+' · Solar '+val(l.sourceNumber||l.number||l.id)+
  (customer&&l.ownerClientId===customer.id?' · Asignado a este cliente':'')+'</option>').join('');
 const lots='<label class="field-group"><span>Etapa</span><select name="stage" id="contract-intake-stage" required>'+
  '<option value="">Selecciona etapa</option>'+stages.map(n=>'<option value="'+n+'" '+(stage===String(n)?'selected':'')+'>Etapa '+n+'</option>').join('')+
  '</select></label><label class="field-group"><span>Solar de Terrenos y Predios</span><select name="lotId" id="contract-intake-lot" required>'+
  '<option value="">'+(stage?'Selecciona bloque y solar':'Primero selecciona etapa')+'</option>'+options+'</select></label>'+
  hidden('block',selected?.block||'')+hidden('number',selected?.sourceNumber||selected?.number||'');
 const measures=selected?'<div class="full notice-card"><strong>Terreno y medidas automáticas</strong><p class="sm">Etapa '+val(selected.stage)+' · Bloque '+
  val(selected.block)+' · Solar '+val(selected.sourceNumber||selected.number)+' · Área '+val(selected.area||'Sin medida')+
  ' m² · Varas² '+val(selected.areaVaras2||'—')+' · Frente '+val(selected.dimensions?.front||'—')+
  ' · Fondo '+val(selected.dimensions?.depth||'—')+
  ' · Izquierdo '+val(selected.dimensions?.left||'—')+' · Derecho '+val(selected.dimensions?.right||'—')+'</p><small>Se obtienen de Terrenos y Predios. No puedes cambiarlas aquí.</small></div>':
  '<div class="full notice-card">Elige el solar para cargar precio y medidas del inventario.</div>';
 const more=extra.map((row,i)=>{
  const idx=i+1,l=all[idx],s=String(row.stage||''),stageOptions=stages.map(n=>'<option value="'+n+'" '+(s===String(n)?'selected':'')+'>Etapa '+n+'</option>').join('');
  const lotOptions=eligible.filter(item=>String(item.stage)===s&&item.id!==selected?.id).map(item=>
   '<option value="'+val(item.id)+'" '+(l?.id===item.id?'selected':'')+'>Bloque '+val(item.block)+' · Solar '+val(item.sourceNumber||item.number||item.id)+'</option>').join('');
  return '<fieldset class="full" style="border:1px solid var(--line,#cbd5d1);border-radius:12px;padding:12px"><legend>Solar '+(idx+1)+'</legend>'+
   '<div class="form-grid"><label class="field-group"><span>Etapa</span><select name="extraStage_'+i+'" required><option value="">Etapa</option>'+stageOptions+'</select></label>'+
   '<label class="field-group"><span>Bloque y solar</span><select name="extraLotId_'+i+'" required><option value="">Selecciona solar</option>'+lotOptions+'</select></label>'+
   hidden('solarPrice_'+idx,l?.price??'')+field('Prima pactada de este solar (L)','solarDown_'+idx,'number',true,false,v['solarDown_'+idx]??row.down??'')+
   '<div class="field-group"><span>Precio en predios</span><strong>'+ (l&&Number(l.price)>0?'L '+contractIntakeManualCash(l.price):'Precio no registrado')+'</strong></div></div>'+
   '<button type="button" class="btn btn-outline btn-sm" data-contract-intake-remove="'+i+'">Quitar solar</button></fieldset>';
 }).join('');
 const priceLabel=total===null?'Sin precio: revisa Terrenos y Predios':'L '+contractIntakeManualCash(total);
 const finText=financed===null?'—':'L '+contractIntakeManualCash(financed),monthlyText=monthly===null?'—':'L '+contractIntakeManualCash(monthly);
 const finances=hidden('solarPrice_0',multi?(selected?.price??''):'')+
  (multi?field('Prima del primer solar (L)','solarDown_0','number',true,false,v.solarDown_0??v.down??'')+
    hidden('down',prima??''):field('Prima pactada (L)','down','number',true))+
  '<label class="field-group"><span>Plazo del crédito en meses</span><input type="number" name="months" min="1" max="360" step="1" required value="'+val(v.months??'')+'"></label>'+
  '<div class="full notice-card"><div><strong>Precio de Terrenos y Predios:</strong> <span id="contract-auto-price">'+priceLabel+'</span></div>'+
  '<div><strong>Saldo a financiar:</strong> <span id="contract-auto-financed">'+finText+'</span></div>'+
  '<div><strong>Cuota mensual (0 % interés):</strong> <span id="contract-auto-monthly">'+monthlyText+'</span></div></div>'+
  '<input type="hidden" name="price" value="'+val(total??'')+'">'+
  '<input type="hidden" name="financed" value="'+val(financed??'')+'">'+
  '<input type="hidden" name="monthly" value="'+val(monthly??'')+'">';
 const payment='<details class="full"><summary>¿Ya recibió la prima? (opcional)</summary>'+
  '<p class="sm muted">Solo marca la casilla si ya recibiste el dinero; el monto pactado por sí solo no es un cobro.</p>'+
  '<label><input type="checkbox" name="primaPaid" value="on" '+(v.primaPaid==='on'?'checked':'')+'> Registrar prima realmente pagada</label>'+
  '<div class="form-grid">'+field('Fecha real del pago','primaDate','date')+
  '<label class="field-group"><span>Método</span><select name="primaMethod">'+
  ['Efectivo','Transferencia','Tarjeta'].map(m=>'<option '+((v.primaMethod||'Efectivo')===m?'selected':'')+'>'+m+'</option>').join('')+
  '</select></label>'+field('Referencia (opcional)','primaRef')+'</div></details>';
 return '<form id="contract-intake-form"><p class="sm muted">Busca al cliente, selecciona su solar y escribe solamente la prima, el plazo y las fechas. Los demás datos se cargan automáticamente.</p>'+
  '<div class="form-grid"><label class="field-group full"><span>Buscar cliente registrado (nombre o identidad)</span>'+
  '<input id="contract-client-search" type="search" autocomplete="off" placeholder="Buscar por nombre o DNI" value="'+val(draft?.clientQuery||'')+'">'+
  '<div id="contract-client-results" style="max-height:200px;overflow:auto"></div></label>'+
  (customer?'<div class="full"><button class="btn btn-outline btn-sm" type="button" data-contract-client-clear>Elegir otro cliente / Crear cliente nuevo</button></div>':'')+
  hidden('clientId',customer?.id||'')+person+lots+measures+more+
  '<div class="full"><button type="button" class="btn btn-outline btn-sm" data-contract-intake-add>+ Agregar otro solar</button></div>'+
  '<div class="full"><strong>Condiciones de la compra</strong></div>'+finances+
  field('Fecha del contrato','date','date',true)+field('Fecha de primera cuota','firstDueDate','date')+payment+
  '<details class="full"><summary>Observaciones (opcional)</summary><textarea name="observations" rows="2" style="width:100%">'+val(v.observations||'')+'</textarea></details></div>'+
  '<div id="contract-intake-alert" role="alert"></div></form>';
}
function contractIntakeManualRecalculate(form){
 if(!form||contractIntakeWorking?.mode!=='manual')return;
 const get=k=>form.elements.namedItem(k)?.value??'';
 const primary=getLot(get('lotId'));
 const n=Number(get('months')),count=contractIntakeWorking.extraLots?.length||0;
 const entries=[primary,...Array.from({length:count},(_,i)=>getLot(get('extraLotId_'+i)))];
 const price=entries.every(l=>l&&Number(l.price)>0)?Math.round(entries.reduce((t,l)=>t+Number(l.price),0)*100)/100:null;
 const downs=count?[get('solarDown_0'),...Array.from({length:count},(_,i)=>get('solarDown_'+(i+1)))]:[get('down')];
 const down=downs.every(x=>x!==''&&Number.isFinite(Number(x)))?Math.round(downs.reduce((t,x)=>t+Number(x),0)*100)/100:null;
 const financed=price!==null&&down!==null?Math.round((price-down)*100)/100:null;
 const monthly=financed!==null&&Number.isInteger(n)&&n>0?Math.round(financed/n*100)/100:null;
 const put=(k,value)=>{const el=form.elements.namedItem(k);if(el)el.value=value??'';};
 put('price',price);
 if(count)put('down',down);
 put('financed',financed);put('monthly',monthly);
 put('solarPrice_0',primary?.price??'');
 for(let i=0;i<count;i++)put('solarPrice_'+(i+1),entries[i+1]?.price??'');
 const putText=(id,value)=>{const el=form.querySelector('#'+id);if(el)el.textContent=value;};
 putText('contract-auto-price',price===null?'Sin precio registrado':'L '+contractIntakeManualCash(price));
 putText('contract-auto-financed',financed===null?'—':'L '+contractIntakeManualCash(financed));
 putText('contract-auto-monthly',monthly===null?'—':'L '+contractIntakeManualCash(monthly));
}
function contractIntakeClientSearch(query){
 const box=document.getElementById('contract-client-results'),draft=contractIntakeWorking;
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
 if(event.target.id==='contract-client-search'){
  contractIntakeWorking.clientQuery=event.target.value;contractIntakeClientSearch(event.target.value);return;
 }
 const form=event.target.closest?.('#contract-intake-form');
 if(!form)return;
 if(['down','months'].includes(event.target.name)||/^solarDown_/.test(event.target.name))
  contractIntakeManualRecalculate(form);
},true);
document.addEventListener('click',event=>{
 if(!contractIntakeWorking||contractIntakeWorking.mode!=='manual')return;
 const choice=event.target.closest?.('[data-contract-client-pick],[data-contract-client-clear]');
 if(!choice)return;
 event.preventDefault();event.stopImmediatePropagation();
 const form=document.getElementById('contract-intake-form');
 if(form)contractIntakeRememberExtras(form);
 const selected=choice.dataset.contractClientPick?getClient(choice.dataset.contractClientPick):null;
 const draft=contractIntakeWorking;
 draft.preferredClientId=selected?.id||'';
 draft.clientQuery=selected?.name||'';
 for(const key of ['name','identity','phone','address','rtn','maritalStatus','occupation'])draft.values[key]=selected?.[key]||'';
 if(selected){
  const assigned=residenceLots().filter(l=>l.ownerClientId===selected.id&&!db.sales.some(s=>s.lotId===l.id)&&!l.pendingContractId);
  if(assigned.length===1){
   const l=assigned[0];Object.assign(draft.values,{lotId:l.id,stage:String(l.stage),block:l.block,number:String(l.sourceNumber||l.number||'')});
  }
 }else draft.values.lotId='';
 document.getElementById('contract-intake-review').innerHTML=contractIntakeFields();
 contractIntakeClientSearch(draft.clientQuery);
},true);

function contractIntakeFields(){
 if(contractIntakeWorking?.mode==='manual')return contractIntakeManualFields();
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
  '<label class="field-group full"><span>Número de recibo o referencia (opcional)</span><input name="primaRef" maxlength="80" value="'+esc(c.primaRef||'')+'"></label>':'';
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
function contractIntakeOpen(clientId='',mode='ocr'){
 if(!contractIntakeAdmin()){toast('Solo el administrador, con datos sincronizados y conexión, puede registrar contratos.','error');return;}
 const existing=clientId?getClient(clientId):null;
 if(clientId&&!existing){toast('No se encontró al cliente seleccionado.','error');return;}
 const manual=mode==='manual';
 contractIntakeWorking={mode:manual?'manual':'ocr',residenceId:residence().id,file:null,preferredClientId:existing?.id||'',values:existing?{
 name:existing.name||'',identity:existing.identity||'',rtn:existing.rtn||'',maritalStatus:existing.maritalStatus||'',
 occupation:existing.occupation||'',address:existing.address||'',phone:existing.phone||''
 }:{},readVersion:0,busy:false};
 const content=manual?
  '<p>Busca un cliente por nombre o identidad. Al elegir su solar, LOTIGEST recupera automáticamente las medidas y el precio. Solo indica prima, plazo en meses y fechas.</p>'+
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
   identity:String(data.identity).trim(),phone:String(data.phone||'').trim(),address:String(data.address||'').trim(),
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
 const original=contractIntakeWorking,alert=document.getElementById('contract-intake-alert'),button=document.getElementById('contract-intake-save');
 if(!original||!form||original.busy||!contractIntakeAdmin())throw Error('La sesión está ocupada o sin autorización.');
 const data=contractIntakeData(form);
 if(original.mode==='manual'){
  // El inventario es la única fuente autorizada del precio. Nunca confiar en
  // el precio enviado por campos HTML (incluso los campos ocultos).
  const entries=Array.isArray(data.lots)&&data.lots.length?data.lots:[{lotId:data.lotId,stage:data.stage,down:data.down}];
  const chosen=entries.map(entry=>{
   const lot=db.lots.find(l=>l.id===entry.lotId&&l.residenceId===original.residenceId);
   if(!lot)throw Error('Selecciona un solar válido de Terrenos y Predios.');
   const price=Number(lot.price);
   if(!(price>0&&Number.isFinite(price)))throw Error('El solar de etapa '+lot.stage+', bloque '+lot.block+' no tiene precio. Completa su precio en Terrenos y Predios.');
   return {lot,price,down:entry.down};
  });
  const cents=v=>Math.round(Number(v)*100);
  if(chosen.some(({down,price})=>down==null||down===''||!Number.isFinite(Number(down))||Number(down)<0||Number(down)>=price))
   throw Error('Revisa la prima pactada de cada solar: debe ser menor que el precio del inventario.');
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
 if(data.date)buyerDate(data.date,'fecha del contrato');
 if(data.firstDueDate&&(!data.date||buyerDate(data.firstDueDate,'primera cuota')<data.date))throw Error('La fecha de la primera cuota no puede ser anterior a la fecha del contrato.');
 if(data.date&&data.date>businessToday())throw Error('La fecha del contrato no puede estar en el futuro.');
 if(received){
  if(!data.date||!data.firstDueDate)throw Error('Para guardar una prima pagada, registra la fecha del contrato y la primera cuota.');
  if(!data.primaDate||buyerDate(data.primaDate,'fecha del pago de prima')<data.date||data.primaDate>businessToday())throw Error('Comprueba la fecha real de la prima. Debe ser posterior al contrato y no futura.');
  if(!['Efectivo','Transferencia','Tarjeta'].includes(data.primaMethod))throw Error('Selecciona un método de pago.');
  if(!(Number(data.down)>0))throw Error('La prima pactada debe ser mayor que cero para registrar el cobro.');
  if(String(data.primaRef||'').length>80)throw Error('Número de recibo demasiado largo.');
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
  const receiptGroup=received&&planned.length>1?'PG-'+crypto.randomUUID():null;
  const now=new Date().toISOString();
  for(const {lot,fields} of planned){
   const target=next.lots.find(l=>l.id===lot.id);
   if(target.ownerClientId&&target.ownerClientId!==client.id)throw Error('Un solar ya está asignado a otro cliente; verifica la identidad.');
   const {rawText:sourceOCR,...structuredFields}=fields;
   // Las claves auxiliares del formulario no forman parte de la descripción.
   for(const k of Object.keys(structuredFields))if(/^(?:extra|solarPrice_|solarDown_|primaPaid$|primaDate$|primaMethod$|primaRef$)/.test(k))delete structuredFields[k];
   const record={id:(original.mode==='manual'?'CM-':'OCR-')+crypto.randomUUID(),clientId:client.id,lotId:lot.id,saleId:'',residenceId:original.residenceId,
    title:'FICHA CONTRACTUAL DE '+String(client.name).slice(0,85),pages:original.mode==='manual'?[]:[{number:1,text:String(data.rawText||'').slice(0,50000),confidence:original.values._confidence??null}],
    structured:{...structuredFields,identity:contractIdentityFormat(client.identity),lotId:lot.id,stage:lot.stage??null,monthlyCalculated:Math.round((fields.price-fields.down)/months*100)/100,downPaymentReceived:received},
    ...(groupId?{contractGroupId:groupId,contractLotIds:planned.map(r=>r.lot.id)}:{}),
    ...(key?{documentKey:key,documentMime:contractIntakeImageMime(original.file)}:{}),format:original.mode==='manual'?'manual':'photo+ocr',status:received?'active':'pending-sale',createdAt:now,updatedAt:now};
   next.contractTexts??=[];next.contractTexts.unshift(record);
   target.ownerClientId=client.id;
   if(received){
    if(!(fields.down>0))throw Error('Todos los solares deben tener una prima positiva si se marca como pagada.');
    const sale={id:'V-'+crypto.randomUUID(),clientId:client.id,lotId:lot.id,type:'credit',
     price:fields.price,downPayment:fields.down,months,date:data.date,firstDueDate:data.firstDueDate,
     openingPaid:0,importedPaidInstallments:0,historical:false,source:'contract-manual',documentId:record.id};
    const payment={id:'P-'+crypto.randomUUID(),saleId:sale.id,date:data.primaDate,amount:fields.down,
     concept:'Prima',method:data.primaMethod,recordedAt:now,
     ...(data.primaRef?{receiptReference:String(data.primaRef).trim()}:{}),
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
   if(!(Number(target.price)>0))target.price=fields.price;
  }
  // El estado de venta sólo se actualizará al activar el crédito.
  cloudWrite(JSON.stringify(next));db=next;
  await cloudFlush();
  if(cloudBlocked||cloudOffline||cloudQueue?.latest!==cloudQueue?.confirmed){
   toast('La ficha se conserva pendiente de sincronizar. Comprueba el indicador de nube antes de ingresar otro contrato.','error');
  }else if(contractIdentityDigits(getClient(client.id)?.identity)!==contractIdentityDigits(data.identity))toast('El servidor confirmó el guardado, pero no aparece el DNI correcto. No registres abonos y revisa Clientes.','error');
  else toast(received?'Contrato, crédito y prima pagada registrados en '+planned.length+' solar(es). Revisa Residenciales y Cobros.':'Ficha y DNI guardados para '+planned.length+' solar(es). Puedes activar cada crédito y registrar los abonos.');
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
  '<label>Fecha de contrato<input name="date" type="date" required value="'+esc(d.structured?.date||'')+'"></label>'+
  '<label>Fecha primera cuota<input name="firstDueDate" type="date" required value="'+esc(d.structured?.firstDueDate||'')+'"></label>'+
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
 if(digits.length!==13)throw Error('El DNI debe tener 13 dígitos. Revisa la ficha contractual.');
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


// Gestión contractual: edición segura, anulación lógica y conservación obligatoria de cobros.
function contractManageRecord(id){
 return (db.contractTexts||[]).find(d=>d.id===id&&['manual','photo+ocr'].includes(d.format)&&d.status!=='voided');
}
function contractManageEditOpen(id){
 if(!contractIntakeAdmin()){toast('Solo un administrador con sincronización confirmada puede editar contratos.','error');return;}
 const d=contractManageRecord(id);
 if(!d){toast('El contrato no existe o está anulado.','error');return;}
 const lot=getLot(d.lotId),client=getClient(d.clientId),v=d.structured||{},financial=!d.saleId&&!db.sales.some(s=>s.lotId===d.lotId);
 const field=(label,key,type='text')=>'<label class="field-group"><span>'+label+'</span><input name="'+key+'" type="'+type+'" '+(type==='number'?'min="0" step="0.01" ':'')+
  'value="'+esc(v[key]??'')+'" style="width:100%;min-width:0"></label>';
 const basic=[['RTN','rtn'],['Estado civil','maritalStatus'],['Profesión u oficio','occupation'],['Dirección','address'],['Teléfono (+504 / +1)','phone'],
  ['Norte','north'],['Sur','south'],['Este','east'],['Oeste','west']].map(([label,key])=>field(label,key)).join('');
 const credit=financial?field('Precio pactado (L)','price','number')+field('Prima pactada (L)','down','number')+
  '<label class="field-group"><span>Plazo (meses)</span><input name="months" type="number" min="1" max="360" step="1" required value="'+esc(v.months??'')+'"></label>'+
  field('Fecha del contrato','date','date')+field('Primera cuota','firstDueDate','date'):'';
 showModal('Editar contrato',
  '<p><strong>'+esc(client?.name||v.name||'Cliente')+'</strong> · DNI '+esc(client?.identity||v.identity||'')+'</p>'+
  '<p>Etapa '+esc(lot?.stage||'—')+' · Bloque '+esc(lot?.block||'—')+' · Solar '+esc(lot?.sourceNumber||'—')+'</p>'+
  '<p class="sm muted">Las medidas y el solar se conservan del inventario. '+(financial?'Puedes corregir precio, prima pactada, fechas y plazo porque todavía no existe venta.':
  'Este contrato tiene una venta: los importes y fechas de crédito se protegen para no alterar abonos ni mora.')+'</p>'+
  '<form id="contract-manage-edit"><input name="documentId" type="hidden" value="'+esc(id)+'"><div class="form-grid">'+basic+credit+'</div>'+
  '<label>Observaciones<textarea name="observations" maxlength="5000" rows="3">'+esc(v.observations||'')+'</textarea></label></form>',
  '<button class="btn btn-outline" data-action="close-modal" type="button">Cancelar</button>'+
  '<button class="btn btn-primary" type="submit" form="contract-manage-edit">Guardar cambios</button>',true);
}
async function contractManageEditSave(form){
 if(!contractIntakeAdmin())throw Error('La nube debe estar sincronizada y tu usuario debe ser administrador.');
 const data=Object.fromEntries(new FormData(form)),d=contractManageRecord(data.documentId);
 if(!d)throw Error('No existe el contrato o ya fue anulado.');
 const lot=getLot(d.lotId),financial=!d.saleId&&!db.sales.some(s=>s.lotId===d.lotId);
 if(!lot)throw Error('El solar vinculado ya no existe.');
 const next=JSON.parse(JSON.stringify(db)),record=next.contractTexts.find(x=>x.id===d.id),p=record.structured||{};
 for(const key of ['rtn','maritalStatus','occupation','address','phone','north','south','east','west','observations']){
  const value=String(data[key]||'').trim();
  if(value.length>(key==='observations'?5000:500))throw Error('Campo demasiado largo: '+key);
  p[key]=value;
 }
 if(financial){
  const price=Number(data.price),down=Number(data.down),months=Number(data.months);
  if(!Number.isFinite(price)||price<=0||!Number.isFinite(down)||down<0||down>=price||!Number.isInteger(months)||months<1||months>360)
   throw Error('Precio, prima pactada o plazo inválidos.');
  if([price,down].some(n=>Math.abs(n*100-Math.round(n*100))>.00001))throw Error('Los importes solo admiten dos decimales.');
  if(data.date)buyerDate(data.date,'fecha de contrato');
  if(data.firstDueDate&&(!data.date||buyerDate(data.firstDueDate,'primera cuota')<data.date))
   throw Error('La primera cuota debe ser posterior al contrato.');
  if(data.date&&data.date>businessToday())throw Error('No puedes ingresar una fecha de contrato futura.');
  Object.assign(p,{price,down,months,financed:Math.round((price-down)*100)/100,
   monthly:Math.round((price-down)/months*100)/100,monthlyCalculated:Math.round((price-down)/months*100)/100,
   date:String(data.date||''),firstDueDate:String(data.firstDueDate||'')});
 }
 record.structured=p;record.updatedAt=new Date().toISOString();
 cloudWrite(JSON.stringify(next));db=next;await cloudFlush();
 closeModal();render();
 if(cloudBlocked||cloudOffline||cloudQueue?.latest!==cloudQueue?.confirmed)
  toast('Contrato modificado localmente; falta confirmar su sincronización.','error');
 else toast('Contrato editado. Se conservaron las medidas, ventas y pagos.');
}
function contractManageDeleteOpen(id){
 if(!contractIntakeAdmin()){toast('Solo un administrador puede eliminar contratos.','error');return;}
 const d=contractManageRecord(id);if(!d){toast('El contrato no existe o ya fue anulado.','error');return;}
 const sale=d.saleId?getSale(d.saleId):null;
 const count=sale?(db.payments||[]).filter(p=>p.saleId===sale.id).length:0;
 showModal('Eliminar contrato',
  '<p>Contrato <strong>'+esc(d.id)+'</strong> de '+esc(getClient(d.clientId)?.name||'cliente')+'.</p>'+
  '<p><strong>La eliminación será una anulación recuperable en el historial.</strong> No borra clientes, medidas, mapas, recibos, primas ni abonos.</p>'+
  (sale?'<p class="sm">Ya existe venta vinculada'+(count?' con '+count+' pago(s).':'')+'; seguirá en Residenciales y Cobros para preservar el dinero y la deuda.</p>':
  '<p class="sm">La ficha no tiene venta. Se liberará la reserva contractual del solar, si no existen otras asignaciones.</p>')+
  '<form id="contract-manage-delete"><input type="hidden" name="documentId" value="'+esc(id)+'"><label>Escribe ELIMINAR para confirmar<input name="confirmation" required autocomplete="off"></label>'+
  '<label>Motivo de la anulación<textarea name="reason" maxlength="300" rows="2"></textarea></label></form>',
  '<button class="btn btn-outline" type="button" data-action="close-modal">Cancelar</button>'+
  '<button class="btn btn-primary" type="submit" form="contract-manage-delete">Confirmar eliminación</button>',true);
}
async function contractManageDeleteSave(form){
 if(!contractIntakeAdmin())throw Error('Solo un administrador con nube sincronizada puede anular.');
 const data=Object.fromEntries(new FormData(form));
 if(String(data.confirmation||'').trim().toUpperCase()!=='ELIMINAR')throw Error('Escribe ELIMINAR para confirmar.');
 const d=contractManageRecord(data.documentId);if(!d)throw Error('Contrato inexistente o ya anulado.');
 const next=JSON.parse(JSON.stringify(db)),record=next.contractTexts.find(x=>x.id===d.id),lot=next.lots.find(l=>l.id===d.lotId);
 const hasSale=next.sales.some(s=>s.id===record.saleId||s.lotId===record.lotId);
 record.status='voided';record.voidedAt=new Date().toISOString();record.voidedBy=String(cloudUser?.name||'Administrador');
 record.voidReason=String(data.reason||'Anulación solicitada por administrador').trim().slice(0,300);
 record.updatedAt=record.voidedAt;
 if(lot&&!hasSale){
  if(lot.pendingContractId===record.id)delete lot.pendingContractId;
  const other=next.contractTexts.some(x=>x.id!==record.id&&x.lotId===lot.id&&x.status!=='voided');
  const ownership=(next.ownershipStatements||[]).some(x=>x.clientId===record.clientId&&(x.references||[]).some(r=>r.lotId===lot.id));
  if(!other&&!ownership&&lot.ownerClientId===record.clientId)delete lot.ownerClientId;
 }
 cloudWrite(JSON.stringify(next));db=next;await cloudFlush();closeModal();render();
 if(cloudBlocked||cloudOffline||cloudQueue?.latest!==cloudQueue?.confirmed)
  toast('Anulación pendiente de sincronizar. Comprueba el estado de la nube.','error');
 else toast('Contrato anulado. Los datos financieros y las medidas permanecen intactos.');
}
document.addEventListener('click',event=>{
 const edit=event.target.closest?.('[data-contract-edit]'),del=event.target.closest?.('[data-contract-delete]');
 if(!edit&&!del)return;
 event.preventDefault();event.stopImmediatePropagation();
 if(edit)contractManageEditOpen(edit.dataset.contractEdit);
 else contractManageDeleteOpen(del.dataset.contractDelete);
},true);
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
