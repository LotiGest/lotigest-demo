// Búsqueda manual compartida y asignación documental de propietarios desde el mapa.
// Este módulo se inserta dentro del cierre original y usa la misma base D1 del programa.
(function installMapOwnerSearch(){
  const norm = value => normalizeClientLookup(value);
  const lotsOf = (id,rid) => db.lots.filter(l => l.residenceId===rid && l.ownerClientId===id)
    .concat(db.sales.filter(s => s.clientId===id).map(s=>getLot(s.lotId)).filter(l=>l && l.residenceId===rid && l.ownerClientId!==id));
  const refsOf = (id,rid) => (db.ownershipStatements||[]).filter(s=>s.clientId===id && s.residenceId===rid).flatMap(s=>s.references||[]);
  const locationText = l => 'Etapa '+(l.stage||'por confirmar')+' · Bloque '+l.block+' · Solar '+(l.sourceNumber||l.number||l.id);
  function clientMatches(c,query,rid){
    if(!query)return true;
    const vals=[c.name,c.identity,c.phone,c.id];
    for(const l of lotsOf(c.id,rid))vals.push(l.id,l.stage,l.block,l.sourceNumber,locationText(l));
    for(const r of refsOf(c.id,rid))vals.push(r.stage,r.block,r.lot,r.lotId,'Etapa '+r.stage+' Bloque '+r.block+' Solar '+r.lot);
    return vals.some(v=>norm(v).includes(query));
  }
  function clientHasResidence(c,rid){
    return lotsOf(c.id,rid).length || refsOf(c.id,rid).length ||
      db.sales.some(s=>s.clientId===c.id && getLot(s.lotId)?.residenceId===rid);
  }
  function clientCard(c,rid,action){
    const lots=lotsOf(c.id,rid),refs=refsOf(c.id,rid);
    const summary=[...new Set(lots.map(locationText).concat(refs.map(r=>'Etapa '+(r.stage||'pendiente')+' · Bloque '+r.block+' · Solar '+r.lot)))].slice(0,12);
    return '<button type="button" class="btn btn-outline" style="display:block;width:100%;text-align:left;white-space:normal;margin:6px 0" data-action="'+action+'" data-id="'+esc(c.id)+'"><strong>'+esc(c.name)+'</strong><br><small>Identidad: '+esc(c.identity||'Pendiente')+' · Tel.: '+esc(c.phone||'—')+'</small><br><small>'+esc(summary.join(' | ')||'Sin terrenos vinculados')+'</small></button>';
  }
  function eligible(l){
    return Boolean(l && l.type!=='private' && l.status!=='private' && l.status!=='reserved' &&
      !db.sales.some(s=>s.lotId===l.id) && !activeReservation(l.id) && !l.ownerClientId);
  }
  function linkPrompt(l){
    const sale=db.sales.find(s=>s.lotId===l.id);
    const owner=sale?.clientId||l.ownerClientId;
    if(owner){
      const c=getClient(owner);
      return '<section class="notice-card" data-map-owner-info><strong>Propietario registrado: '+esc(c?.name||'Por verificar')+'</strong><p>Identidad: '+esc(c?.identity||'Pendiente')+'. Se conserva el historial de esta persona.</p>'+
        (c?'<button type="button" class="btn btn-outline" data-action="view-client" data-id="'+esc(c.id)+'">Ver ficha del cliente</button>':'')+'</section>';
    }
    if(!eligible(l))return '<section class="notice-card" data-map-owner-info><strong>Propietario no modificable</strong><p>Revisa la venta, el apartado o el estado privado antes de asignar un comprador.</p></section>';
    return '<section class="notice-card" data-map-owner-info><strong>Propietario pendiente de vincular</strong><p>Asigna el dueño directamente al solar. Esto no crea recibos, primas, cuotas ni una venta nueva.</p><button type="button" class="btn btn-primary" data-action="map-owner-start" data-id="'+esc(l.id)+'">Asignar dueño del solar</button></section>';
  }
  const previousSolarWindow=openSolarWindow;
  openSolarWindow=function(lotId){
    previousSolarWindow(lotId);
    const l=getLot(lotId),target=$('#modal-root .modal-content');
    if(l && target && !target.querySelector('[data-map-owner-info]'))target.insertAdjacentHTML('afterbegin',linkPrompt(l));
  };
  const previousViewLot=viewLot;
  viewLot=function(lotId){
    previousViewLot(lotId);
    const l=getLot(lotId),target=$('#modal-root .modal-content');
    if(l && target && !target.querySelector('[data-map-owner-info]'))target.insertAdjacentHTML('beforeend',linkPrompt(l));
  };
  function openOwnerLink(id){
    const lot=getLot(id);if(!lot)return;
    if(!eligible(lot)){toast('Este terreno ya tiene venta, propietario, apartado o es privado. No se sobrescribió.','error');return;}
    showModal('Asignar propietario · '+esc(lot.id),
      '<p><strong>'+esc(residenceName(lot.residenceId))+'</strong> · '+esc(locationText(lot))+'</p>'+
      '<p>Vincula al cliente que figura en el contrato. Los datos y pagos anteriores no serán reemplazados.</p>'+
      '<form id="map-owner-form"><input type="hidden" name="lotId" value="'+esc(lot.id)+'">'+
      '<label>¿El cliente ya existe?<select name="ownerMode" id="map-owner-mode"><option value="existing">Buscar cliente existente</option><option value="new">Registrar cliente nuevo</option></select></label>'+
      '<section id="map-owner-existing"><label>Buscar por nombre, identidad o teléfono<input id="map-owner-search" type="search" autocomplete="off" placeholder="Escribe el nombre o identidad"></label><input type="hidden" name="clientId" id="map-owner-client-id"><div id="map-owner-picked" role="status">Elige una persona de los resultados.</div><div id="map-owner-results" style="max-height:240px;overflow:auto"></div></section>'+
      '<section id="map-owner-new" hidden><div class="form-grid">'+
      field('Nombre completo','ownerName','',{full:true,extra:'maxlength="200"'})+
      field('Identidad (si está disponible)','ownerIdentity','',{extra:'maxlength="40"'})+
      field('Teléfono','ownerPhone','',{extra:'maxlength="40"'})+
      field('Dirección','ownerAddress','',{full:true,extra:'maxlength="300"'})+
      '</div></section><p class="sm muted">La identidad pendiente queda señalada. La asignación indica propietario documentado; las condiciones del crédito y los abonos se revisan por separado.</p>'+
      '<label><input type="checkbox" name="confirmed" required> Verifiqué en el contrato el nombre, etapa, bloque y solar.</label><p id="map-owner-error" role="alert" style="color:#bd3742"></p></form>',
      '<button type="button" class="btn btn-soft" data-action="close-modal">Cancelar</button><button class="btn btn-primary" type="submit" form="map-owner-form">Guardar propietario</button>',true);
  }
  function resultOwners(){
    const area=$('#map-owner-results'),input=$('#map-owner-search');
    if(!area||!input)return;
    const q=norm(input.value),all=q?db.clients.filter(c=>[c.name,c.identity,c.phone].some(v=>norm(v).includes(q))):[];
    area.innerHTML=!q?'<p>Escribe para buscar entre los clientes existentes.</p>':all.length?all.slice(0,40).map(c=>clientCard(c,residence().id,'map-owner-pick')).join(''):'<p>No hay coincidencias. Revisa los datos antes de crear otro cliente.</p>';
  }
  function saveOwner(form){
    const error=$('#map-owner-error'),lot=getLot(form.elements.lotId.value),old=JSON.stringify(db);
    try{
      if(!eligible(lot))throw Error('El solar ya está asignado, apartado o tiene una venta. Actualiza la ficha.');
      if(!form.elements.confirmed.checked)throw Error('Confirma que revisaste el contrato y el solar.');
      let client;
      if(form.elements.ownerMode.value==='existing'){
        client=getClient(form.elements.clientId.value);
        if(!client)throw Error('Busca y selecciona un cliente existente.');
      }else{
        const name=String(form.elements.ownerName.value||'').trim().toUpperCase();
        const identity=String(form.elements.ownerIdentity.value||'').trim().toUpperCase().replace(/[\s-]/g,'');
        if(name.length<3||name.length>200||identity.length>40)throw Error('Revisa el nombre o la identidad del cliente.');
        if(db.clients.some(c=>identity && norm(c.identity)===norm(identity)))throw Error('Esta identidad ya pertenece a un cliente. Selecciónalo desde la búsqueda.');
        if(db.clients.some(c=>norm(c.name)===norm(name)))throw Error('Ya existe una persona con ese nombre. Búscala antes de crear otra.');
        client={id:'C-'+crypto.randomUUID(),name,identity,identityPending:!identity,
          phone:String(form.elements.ownerPhone.value||'').trim(),
          address:String(form.elements.ownerAddress.value||'').trim()};
        db.clients.push(client);
      }
      const conflicts=(db.ownershipStatements||[]).some(s=>s.residenceId===lot.residenceId && s.clientId && s.clientId!==client.id &&
        (s.references||[]).some(r=>r.lotId===lot.id));
      if(conflicts)throw Error('Este solar aparece documentado a nombre de otra persona. Corrige primero la ficha.');
      const current=db.lots.find(l=>l.id===lot.id);
      current.ownerClientId=client.id;
      current.ownerIdentityPending=!client.identity;
      current.status='sold';
      const r=db.residences.find(r=>r.id===lot.residenceId),record=r?.records?.[lot.sourceFeatureKey];
      if(record && (record.status==='available'||record.status==='sold'))record.status='sold';
      if(!designPersist())throw Error('No se pudo guardar. Revisa el espacio y la sincronización.');
      selectedLot=lot.id;
      closeModal();render();openSolarWindow(lot.id);
      toast('Propietario vinculado al solar. Verifica el indicador «✓ Guardado» de la nube.');
    }catch(e){db=JSON.parse(old);if(error?.isConnected)error.textContent=e.message;else toast(e.message,'error');}
  }
  const priorLotsPage=lotsPage;
  lotsPage=function(){
    const html=priorLotsPage();
    const searchBox='<section class="card" style="padding:15px;margin:0 0 16px"><label for="land-owner-search"><strong>Buscar cliente manualmente en Terrenos</strong></label><input id="land-owner-search" type="search" autocomplete="off" placeholder="Nombre, identidad, teléfono, etapa, bloque o solar" style="width:100%;margin-top:6px"><div id="land-owner-results" role="status" style="max-height:300px;overflow:auto"></div></section>';
    return html.replace('<div class="page-cols">',searchBox+'<div class="page-cols">');
  };
  function renderLandLookup(){
    const input=$('#land-owner-search'),out=$('#land-owner-results');if(!input||!out)return;
    const rid=residence().id,q=norm(input.value);
    if(!q){out.innerHTML='<p class="sm muted">Escribe para localizar solares de un propietario de esta residencial.</p>';return;}
    const clients=db.clients.filter(c=>clientHasResidence(c,rid)&&clientMatches(c,q,rid)).slice(0,60);
    out.innerHTML=clients.map(c=>{
      const lots=lotsOf(c.id,rid);
      return '<section class="notice-card" style="margin:8px 0"><strong>'+esc(c.name)+'</strong><br><small>'+esc(c.identity||'Identidad pendiente')+' · '+esc(c.phone||'Sin teléfono')+'</small><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">'+
        lots.map(l=>'<button type="button" class="btn btn-soft btn-sm" data-action="view-lot" data-id="'+esc(l.id)+'">'+esc(locationText(l))+'</button>').join('')+
        '<button type="button" class="btn btn-outline btn-sm" data-action="view-client" data-id="'+esc(c.id)+'">Ver cliente</button></div></section>';
    }).join('')||'<p>No hay propietarios que coincidan. Comprueba también la etapa y el bloque.</p>';
  }
  // Abonos: busca manual por identidad, teléfono, nombre y ubicación del solar.
  renderOwnerCustomers=function(){
    const out=$('#owner-payment-customers'),input=$('#owner-payment-search');if(!out||!input)return;
    input.placeholder='Nombre, identidad, teléfono, etapa, bloque o solar';
    const rid=residence().id,q=norm(input.value);
    const clients=db.clients.filter(c=>clientHasResidence(c,rid)&&clientMatches(c,q,rid)).slice(0,100);
    out.innerHTML=clients.map(c=>clientCard(c,rid,'owner-payment-person')).join('')||
      '<p>No se encontraron clientes en esta residencial. Revisa nombre, identidad o referencia del solar.</p>';
  };
  document.addEventListener('click',e=>{
    const button=e.target.closest?.('[data-action]');if(!button)return;
    const action=button.dataset.action;
    if(!['map-owner-start','map-owner-pick'].includes(action))return;
    e.preventDefault();e.stopImmediatePropagation();
    if(action==='map-owner-start')openOwnerLink(button.dataset.id);
    else{
      const c=getClient(button.dataset.id),input=$('#map-owner-client-id'),text=$('#map-owner-picked');
      if(c&&input&&text){input.value=c.id;text.textContent='Seleccionado: '+c.name+' · '+(c.identity||'Sin identidad');$('#map-owner-results').innerHTML='';}
    }
  },true);
  document.addEventListener('input',e=>{
    if(e.target.id==='map-owner-search'){const id=$('#map-owner-client-id');if(id)id.value='';const picked=$('#map-owner-picked');if(picked)picked.textContent='Elige una persona de los resultados.';resultOwners();}
    if(e.target.id==='land-owner-search')renderLandLookup();
  });
  document.addEventListener('change',e=>{
    if(e.target.id==='map-owner-mode'){
      const isNew=e.target.value==='new';
      $('#map-owner-existing').hidden=isNew;
      $('#map-owner-new').hidden=!isNew;
    }
  });
  document.addEventListener('submit',e=>{if(e.target.id==='map-owner-form'){e.preventDefault();saveOwner(e.target);}});
})();