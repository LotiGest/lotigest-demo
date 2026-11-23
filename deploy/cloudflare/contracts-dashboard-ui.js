// LOTIGEST · Contratos: pantalla reorganizada, sin modificar datos.
(function contractDashboardInstall(){
 const state={residence:null,query:'',stage:'all',block:'all',solar:'all',status:'all',page:1};
 const perPage=10;
 const norm=x=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-HN').trim();
 const val=x=>String(x??'').trim();
 const num=l=>val(l?.sourceNumber??l?.number??l?.id);
 const distinct=arr=>[...new Set(arr.filter(Boolean))].sort(new Intl.Collator('es-HN',{numeric:true,sensitivity:'base'}).compare);
 const opt=(value,label,selected)=>'<option value="'+esc(value)+'"'+(selected===value?' selected':'')+'>'+esc(label)+'</option>';
 const statuses={all:'Todos los estados',active:'Activo',pending:'Pendiente de activar',registered:'Ficha registrada',voided:'Anulado',missing:'Sin ficha contractual'};
 function relatedIds(d){const s=d.saleId?getSale(d.saleId):null;return [...new Set([...(Array.isArray(d.contractLotIds)?d.contractLotIds:[]),d.lotId,s?.lotId].filter(Boolean))];}
 function makeRows(){
  const rid=residence().id;
  const docs=(db.contractTexts||[]).filter(d=>d.residenceId===rid);
  const records=docs.map(d=>{
   const sale=d.saleId?getSale(d.saleId):null;
   return {type:'doc',id:d.id,doc:d,sale,client:getClient(d.clientId),clientId:d.clientId||'',
    lots:relatedIds(d).map(getLot).filter(l=>l?.residenceId===rid),
    status:d.status==='voided'?'voided':d.status==='active'?'active':d.status==='pending-sale'?'pending':'registered',
    date:sale?.date||d.structured?.date||d.createdAt||d.updatedAt||'',
    amount:d.structured?.price??sale?.price??null};
  });
  const sales=(db.sales||[]).filter(s=>getLot(s.lotId)?.residenceId===rid&&!docs.some(d=>d.saleId===s.id||(d.clientId===s.clientId&&relatedIds(d).includes(s.lotId))));
  records.push(...sales.map(s=>({type:'sale',id:s.id,sale:s,client:getClient(s.clientId),clientId:s.clientId||'',lots:[getLot(s.lotId)].filter(Boolean),status:'missing',date:s.date||'',amount:s.price??null})));
  return records.sort((a,b)=>val(b.date).localeCompare(val(a.date))||val(a.id).localeCompare(val(b.id)));
 }
 function locationMatch(r,key,selected){
  if(selected==='all')return true;
  const linked=r.lots.some(l=>key==='stage'?val(l.stage)===selected:key==='block'?val(l.block)===selected:norm(num(l))===norm(selected));
  if(linked)return true;
  if(r.status!=='voided')return false;
  const saved=contractRecordedLocation(r.doc);
  return key==='stage'?saved.stage===selected:key==='block'?saved.block===selected:norm(saved.number)===norm(selected);
 }
 function filtered(all){return all.filter(r=>locationMatch(r,'stage',state.stage)&&locationMatch(r,'block',state.block)&&locationMatch(r,'solar',state.solar)&&
  (state.status==='all'||state.status===r.status)&&
  (!state.query||norm([r.id,r.client?.name,r.client?.identity,r.doc?.title,r.doc?.voidReason,
   r.status==='voided'?'etapa '+contractRecordedLocation(r.doc).stage+' bloque '+contractRecordedLocation(r.doc).block+' solar '+contractRecordedLocation(r.doc).number:'',
   ...r.lots.flatMap(l=>['etapa '+l.stage,'bloque '+l.block,'solar '+num(l),l.id])].join(' ')).includes(norm(state.query))));}
 function contractRecordedLocation(doc){
  const s=doc?.structured||{};
  return {stage:val(s.stage),block:val(s.block),number:val(s.number)};
 }
 function contractVoidMismatch(r){
  const saved=contractRecordedLocation(r.doc),lot=r.lots[0];
  return Boolean(lot&&(
   (saved.stage&&norm(saved.stage)!==norm(lot.stage))||
   (saved.block&&norm(saved.block)!==norm(lot.block))||
   (saved.number&&norm(saved.number)!==norm(num(lot)))));
 }
 function where(r){
  const l=r.lots[0],saved=contractRecordedLocation(r.doc);
  const linked=l?'Etapa '+esc(l.stage||'—')+' / Bloque '+esc(l.block||'—')+' / Solar '+esc(num(l)):'Sin solar vinculado';
  const extras=r.lots.length>1?'<small class="ct-more">+'+(r.lots.length-1)+' solares adicionales</small>':'';
  if(r.status!=='voided')return linked+extras;
  const recorded=saved.stage||saved.block||saved.number?
   'Etapa '+esc(saved.stage||'—')+' / Bloque '+esc(saved.block||'—')+' / Solar '+esc(saved.number||'—'):
   'Sin ubicación escrita en la ficha';
  return '<span class="ct-void-location">Vinculado: '+linked+'</span>'+extras+
   '<small class="ct-more'+(contractVoidMismatch(r)?' ct-void-mismatch':'')+'">Según ficha: '+recorded+
   (contractVoidMismatch(r)?' · Revisar diferencia':'')+'</small>';
 }
 function contractVoidedView(id){
  const d=(db.contractTexts||[]).find(x=>x.id===id&&x.status==='voided'&&x.residenceId===residence().id);
  if(!d)return;
  const client=getClient(d.clientId),saved=contractRecordedLocation(d);
  const linked=relatedIds(d).map(getLot).filter(l=>l?.residenceId===d.residenceId);
  const linkedLabel=linked.length?linked.map(l=>'Etapa '+esc(l.stage||'—')+' · Bloque '+esc(l.block||'—')+' · Solar '+esc(num(l))).join('; '):'No se encontró el solar vinculado';
  const savedLabel=saved.stage||saved.block||saved.number?
   'Etapa '+esc(saved.stage||'—')+' · Bloque '+esc(saved.block||'—')+' · Solar '+esc(saved.number||'—'):
   'No registrado en la ficha';
  const mismatch=contractVoidMismatch({doc:d,lots:linked});
  const date=value=>/^\d{4}-\d{2}-\d{2}/.test(val(value))?fmtDate(val(value).slice(0,10)):'No registrada';
  const cash=value=>value==null||value===''||!Number.isFinite(Number(value))?'—':money(Number(value));
  const moneyLine=(label,value)=>'<div class="detail-line"><span>'+label+'</span><strong>'+esc(cash(value))+'</strong></div>';
  const info=d.structured||{},sale=d.saleId?getSale(d.saleId):null;
  const body='<div class="ct-void-detail" role="region" aria-label="Detalle de contrato anulado">'+
   '<p class="ct-void-alert"><strong>Contrato anulado · Solo lectura.</strong> Consultar esta ficha no vuelve a activar el contrato ni modifica el solar o los pagos.</p>'+
   '<div class="detail-line"><span>Número de ficha</span><strong>'+esc(d.id)+'</strong></div>'+
   '<div class="detail-line"><span>Cliente</span><strong>'+esc(client?.name||info.name||'Sin nombre')+'</strong></div>'+
   '<div class="detail-line"><span>Identidad</span><strong>'+esc(client?.identity||info.identity||'—')+'</strong></div>'+
   '<div class="detail-line"><span>Fecha del contrato</span><strong>'+esc(date(info.date||d.createdAt))+'</strong></div>'+
   '<div class="detail-line"><span>Fecha de anulación</span><strong>'+esc(date(d.voidedAt||d.updatedAt))+'</strong></div>'+
   '<div class="detail-line"><span>Anulado por</span><strong>'+esc(d.voidedBy||'Sin registro')+'</strong></div>'+
   '<div class="ct-void-section"><strong>Motivo de anulación</strong><p>'+esc(d.voidReason||'No se especificó motivo')+'</p></div>'+
   '<div class="ct-void-section"><strong>Terreno vinculado en el inventario</strong><p>'+linkedLabel+'</p></div>'+
   '<div class="ct-void-section"><strong>Terreno escrito en la ficha</strong><p>'+savedLabel+'</p></div>'+
   (mismatch?'<p class="ct-void-warning"><strong>Atención:</strong> la ubicación guardada en la ficha no coincide con el terreno vinculado. Revisa etapa, bloque y solar antes de registrar una ficha nueva.</p>':'')+
   moneyLine('Precio pactado',info.price??sale?.price)+moneyLine('Prima pactada',info.down??sale?.downPayment)+
   moneyLine('Saldo financiado',info.financed)+
   (d.documentKey?'<p><a class="btn btn-outline btn-sm" target="_blank" rel="noopener noreferrer" href="/api/app/file?key='+encodeURIComponent(d.documentKey)+'">Ver imagen original</a></p>':'')+
   (sale?'<p class="sm muted">Esta ficha tiene una venta vinculada. Verifica sus pagos antes de generar otro contrato para no duplicar cobros.</p>':
   '<p class="sm muted">Si el solar correcto era otro, registra una ficha nueva desde Nuevo contrato y selecciona etapa, bloque y número correctos. Esta anulación queda en el historial.</p>')+
   '</div>';
  showModal('Consultar contrato anulado',body,
   '<button type="button" class="btn btn-outline" data-action="close-modal">Cerrar</button>',true);
 }
 function actions(r){
  if(r.type==='sale')return '<button class="btn btn-outline btn-sm" data-ct-manual="'+esc(r.clientId)+'">Ficha manual</button> '+
    '<button class="btn btn-outline btn-sm" data-action="contract-scan" data-client="'+esc(r.clientId)+'" data-id="'+esc(r.id)+'">Escanear texto</button> '+
    '<button class="btn btn-outline btn-sm" data-action="contract-preview" data-id="'+esc(r.id)+'">Plantilla</button>';
  const d=r.doc;
  if(d.status==='voided')return '<button type="button" class="btn btn-outline btn-sm" data-ct-voided-view="'+esc(d.id)+'">Ver anulación</button>';
  return '<button class="btn btn-outline btn-sm" data-contract-ficha-view="'+esc(d.id)+'">Ver</button> '+
   (d.status!=='voided'?'<button class="btn btn-outline btn-sm" data-contract-edit="'+esc(d.id)+'">Editar</button> '+
    '<button class="btn btn-outline btn-sm" data-contract-delete="'+esc(d.id)+'">Eliminar</button> ':'')+
   (d.structured&&d.clientId?'<button class="btn btn-outline btn-sm" data-contract-sheet="'+esc(d.id)+'">PDF</button> ':'')+
   (r.sale?'<button class="btn btn-outline btn-sm" data-action="contract-preview" data-id="'+esc(r.sale.id)+'">Plantilla</button> ':'')+
   (d.format==='text-only'?'<button class="btn btn-outline btn-sm" data-action="contract-text-edit" data-id="'+esc(d.id)+'">Editar texto</button> ':'')+
   (d.status==='pending-sale'?'<button class="btn btn-primary btn-sm" data-contract-intake-activate="'+esc(d.id)+'">Activar crédito</button> ':'')+
   (d.documentKey?'<a class="btn btn-outline btn-sm" href="/api/app/file?key='+encodeURIComponent(d.documentKey)+'" target="_blank" rel="noopener noreferrer">Original</a>':'');
 }
 contractsPage=function(){
  const rid=residence().id;
  if(state.residence!==rid)Object.assign(state,{residence:rid,query:'',stage:'all',block:'all',solar:'all',status:'all',page:1});
  const all=makeRows(),stages=distinct(all.flatMap(r=>r.lots.map(l=>val(l.stage))));
  const stageRows=all.filter(r=>locationMatch(r,'stage',state.stage));
  const blocks=distinct(stageRows.flatMap(r=>r.lots.map(l=>val(l.block))));
  if(state.block!=='all'&&!blocks.includes(state.block))state.block='all';
  const blockRows=stageRows.filter(r=>locationMatch(r,'block',state.block));
  const solars=distinct(blockRows.flatMap(r=>r.lots.map(num)));
  if(state.solar!=='all'&&!solars.includes(state.solar))state.solar='all';
  const list=filtered(all),pages=Math.max(1,Math.ceil(list.length/perPage));
  state.page=Math.min(Math.max(state.page,1),pages);
  const start=(state.page-1)*perPage,subset=list.slice(start,start+perPage);
  const count=s=>all.filter(r=>r.status===s).length;
  const toolbar='<button type="button" class="btn btn-primary" data-contract-intake-open>'+ic('plus')+' Nuevo contrato</button>'+
    '<button type="button" class="btn btn-outline" data-ct-print>'+ic('printer')+' Imprimir</button>'+
    '<button type="button" class="btn btn-outline" data-ct-export>'+ic('download')+' Exportar Excel</button>';
  const cards='<div class="ct-stats">'+[['all','▤','Fichas registradas',all.filter(r=>r.type==='doc').length],['active','✓','Activos',count('active')],['pending','◷','Por completar',count('pending')+count('missing')],['voided','×','Anulados',count('voided')]]
    .map(([style,icon,label,n])=>style==='voided'?
     '<button type="button" class="ct-stat ct-voided ct-stat-link" data-ct-show-voided aria-pressed="'+(state.status==='voided')+'" title="Mostrar contratos anulados"><span class="ct-symbol" aria-hidden="true">'+icon+'</span><span><small>'+label+'</small><strong>'+n+'</strong><small>Ver lista</small></span></button>':
     '<div class="ct-stat ct-'+style+'"><span class="ct-symbol" aria-hidden="true">'+icon+'</span><div><small>'+label+'</small><strong>'+n+'</strong></div></div>').join('')+'</div>';
  const filters='<section class="card ct-filters"><div class="ct-fields">'+
    '<label>Buscar contrato<input type="search" id="ct-query" value="'+esc(state.query)+'" placeholder="Contrato, cliente, identidad o solar"></label>'+
    '<label>Etapa<select id="ct-stage">'+opt('all','Todas',state.stage)+stages.map(s=>opt(s,'Etapa '+s,state.stage)).join('')+'</select></label>'+
    '<label>Bloque<select id="ct-block">'+opt('all','Todos',state.block)+blocks.map(b=>opt(b,'Bloque '+b,state.block)).join('')+'</select></label>'+
    '<label>Solar<select id="ct-solar">'+opt('all','Todos',state.solar)+solars.map(n=>opt(n,'Solar '+n,state.solar)).join('')+'</select></label>'+
    '<label>Estado<select id="ct-status">'+Object.entries(statuses).map(([s,t])=>opt(s,t,state.status)).join('')+'</select></label>'+
    '<button class="btn btn-outline" type="button" data-ct-clear>Limpiar</button></div></section>';
  const table='<section class="card"><div class="panel-table-head"><h2>'+(state.status==='voided'?'Contratos anulados':'Registro de contratos')+'</h2><span class="sm muted">'+list.length+' resultado(s)</span></div>'+
    '<div class="table-scroll ct-scroll" role="region" aria-label="Tabla de contratos" tabindex="0"><table class="ct-table"><thead><tr>'+
    '<th>N.º contrato / ficha</th><th>Cliente</th><th>Terreno (etapa / bloque / solar)</th><th>Fecha / registro</th><th>Monto (L)</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>'+
    subset.map(r=>'<tr><td class="strong">'+(r.type==='doc'?esc(r.id):'—'+ '<small class="ct-more">Venta '+esc(r.id)+'</small>')+'</td>'+
      '<td>'+esc(r.client?.name||r.doc?.structured?.name||'Cliente por completar')+'</td>'+
      '<td>'+where(r)+'</td><td>'+(r.date&&/^\d{4}-\d{2}-\d{2}/.test(String(r.date))?fmtDate(String(r.date).slice(0,10)):'—')+'</td>'+
      '<td class="tabular">'+(r.amount==null||r.amount===''||!Number.isFinite(Number(r.amount))?'—':money(Number(r.amount)))+'</td>'+
      '<td><span class="ct-state ct-'+r.status+'">'+esc(statuses[r.status])+'</span></td><td class="ct-actions">'+actions(r)+'</td></tr>').join('')+
    '</tbody></table>'+(subset.length?'':'<p class="empty">No hay contratos con los filtros seleccionados.</p>')+'</div>'+
    '<footer class="ct-pagination"><span>Mostrando '+(list.length?start+1:0)+' a '+(start+subset.length)+' de '+list.length+'</span>'+
    '<div><button class="btn btn-outline btn-sm" data-ct-page="'+(state.page-1)+'" '+(state.page<=1?'disabled':'')+'>Anterior</button>'+
    '<span>Página '+state.page+' de '+pages+'</span>'+
    '<button class="btn btn-outline btn-sm" data-ct-page="'+(state.page+1)+'" '+(state.page>=pages?'disabled':'')+'>Siguiente</button></div></footer></section>';
  const assignments=(db.lots||[]).filter(l=>l.residenceId===rid&&l.ownerClientId&&getClient(l.ownerClientId)).sort((a,b)=>val(getClient(a.ownerClientId).name).localeCompare(val(getClient(b.ownerClientId).name),'es-HN')||val(a.stage).localeCompare(val(b.stage),'es-HN',{numeric:true}));
  const tools='<details class="card ct-tools"><summary>Más herramientas de contratos</summary><p class="sm muted">Estas operaciones conservan las fichas, los pagos y las medidas actuales.</p>'+
    '<div class="ct-tool-actions"><button class="btn btn-outline" data-contract-owner-manual>Ficha de contrato manual</button>'+
    '<button class="btn btn-outline" data-contract-owner-open>Asignar solares a un cliente</button>'+
    '<button class="btn btn-outline" data-action="contract-scan-choose">Escanear contrato (solo texto)</button>'+
    '<button class="btn btn-outline" data-contract-rebuild-open>Preparar limpieza de clientes</button>'+
    '<button class="btn btn-outline" data-page="residences">Administrar residenciales</button></div>'+
    (typeof annexPlansMarkup==='function'?annexPlansMarkup(residence()):'')+    '<details style="margin:12px 0"><summary>Solares asignados a clientes ('+assignments.length+')</summary>'+    '<div class="table-scroll"><table><thead><tr><th>Cliente</th><th>Etapa</th><th>Bloque</th><th>Solar</th></tr></thead><tbody>'+    assignments.slice(0,70).map(l=>'<tr><td>'+esc(getClient(l.ownerClientId).name)+'</td><td>'+esc(l.stage||'—')+'</td><td>'+esc(l.block||'—')+'</td><td>'+esc(num(l))+'</td></tr>').join('')+'</tbody></table></div>'+    (assignments.length>70?'<p class="sm muted">Se muestran 70 registros; el resto continúa disponible en Clientes.</p>':'')+'</details>'+
    '<p class="sm muted">Registrar una ficha no significa cobrar la prima. El crédito y los abonos se activan por separado.</p></details>';
  return '<div class="ct-module">'+
    header('Contratos','Gestión de fichas, documentos y terrenos vinculados.',toolbar)+
    cards+filters+table+tools+'</div>';
 };
 // En Contratos, aprovechar la barra superior del sistema en lugar de repetir
 // cabecera, selector de residencial y botones dentro del área de trabajo.
 function contractToolbarInTopbar(){
  const root=document.getElementById('app');
  const bar=root?.querySelector('.lg-topbar');
  const content=root?.querySelector('.ct-module');
  const head=content?.querySelector('.page-head');
  const buttons=head?.querySelector('.head-actions');
  if(!bar||!content||!head||!buttons||bar.querySelector('.ct-top-actions'))return;
  const toolbar=document.createElement('div');
  toolbar.className='ct-top-actions';
  toolbar.setAttribute('aria-label','Residencial y acciones de contratos');
  const label=document.createElement('label');
  label.className='ct-top-residence';
  label.htmlFor='ct-top-residence-select';
  const name=document.createElement('span');
  name.textContent='Residencial';
  const select=document.createElement('select');
  select.id='ct-top-residence-select';
  select.setAttribute('data-residence-picker','');
  select.setAttribute('aria-label','Seleccionar residencial para contratos');
  const current=residence().id;
  for(const r of db.residences.filter(r=>!r.hidden||r.id===current)){
   const opt=document.createElement('option');
   opt.value=r.id;opt.textContent=r.name;
   opt.selected=r.id===current;
   select.appendChild(opt);
  }
  label.append(name,select);
  toolbar.appendChild(label);
  // Mover los botones reales: se conservan sus data-action y permisos existentes.
  while(buttons.firstChild)toolbar.appendChild(buttons.firstChild);
  bar.insertBefore(toolbar,bar.querySelector('.lg-top-tools'));
  bar.classList.add('ct-topbar');
  head.remove();
  // Proteger esta vista frente a otros adaptadores que añadieran otro selector.
  content.querySelectorAll('[data-residence-picker]').forEach(el=>{
   const wrapper=el.closest('.card');
   if(wrapper&&wrapper.querySelectorAll('[data-residence-picker]').length===1){
    wrapper.remove();
   }else{
    el.closest('label')?.remove();
   }
  });
 }
 const contractDashboardPreviousRender=render;
 render=function(){
  const result=contractDashboardPreviousRender.apply(this,arguments);
  if(page==='contracts')contractToolbarInTopbar();
  return result;
 };
 function update(key,val){state[key]=val;state.page=1;if(key==='stage'){state.block='all';state.solar='all';}else if(key==='block')state.solar='all';render();}
 document.addEventListener('input',e=>{
  if(e.target.id!=='ct-query')return;
  const index=typeof e.target.selectionStart==='number'?e.target.selectionStart:null;
  update('query',e.target.value);
  const input=document.getElementById('ct-query');
  if(input){input.focus({preventScroll:true});if(index!==null)input.setSelectionRange(index,index);}
 });
 document.addEventListener('change',e=>{
  const keys={'ct-stage':'stage','ct-block':'block','ct-solar':'solar','ct-status':'status'};
  if(keys[e.target.id])update(keys[e.target.id],e.target.value);
 });
 document.addEventListener('click',e=>{
  const btn=e.target.closest?.('[data-ct-manual],[data-ct-print],[data-ct-export],[data-ct-clear],[data-ct-page],[data-ct-show-voided],[data-ct-voided-view]');
  if(!btn)return;
  e.preventDefault();
  if(btn.hasAttribute('data-ct-voided-view'))return contractVoidedView(btn.dataset.ctVoidedView);
  if(btn.hasAttribute('data-ct-show-voided')){
   const next=state.status==='voided'?'all':'voided';
   Object.assign(state,{query:'',stage:'all',block:'all',solar:'all',status:next,page:1});
   render();return;
  }
  if(btn.hasAttribute('data-ct-manual'))return contractIntakeOpen(btn.dataset.ctManual,'manual');
  if(btn.hasAttribute('data-ct-clear')){Object.assign(state,{query:'',stage:'all',block:'all',solar:'all',status:'all',page:1});render();return;}
  if(btn.hasAttribute('data-ct-page')){const n=Number(btn.dataset.ctPage);if(Number.isSafeInteger(n)&&n>=1){state.page=n;render();}return;}
  if(btn.hasAttribute('data-ct-print')){window.print();return;}
  if(btn.hasAttribute('data-ct-export')){
   const headers=['Ficha / contrato','Venta','Cliente','Identidad','Etapa','Bloque','Solar(es)','Fecha / registro','Monto (L)','Estado'];
   const lines=filtered(makeRows()).map(r=>[r.type==='doc'?r.id:'',r.sale?.id||'',r.client?.name||r.doc?.structured?.name||'',r.client?.identity||'',
    distinct(r.lots.map(l=>l.stage)).join(', '),distinct(r.lots.map(l=>l.block)).join(', '),r.lots.map(num).join(', '),
    String(r.date||'').slice(0,10),r.amount??'',statuses[r.status]]);
   downloadExcel('LOTIGEST_Contratos_'+new Date().toISOString().slice(0,10)+'.xlsx',headers,lines);
  }
 });
})();