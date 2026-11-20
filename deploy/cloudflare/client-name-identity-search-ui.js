// Búsqueda manual de clientes por nombre o cédula en Terrenos y Abonos.
// Solo consulta datos existentes y abre las fichas/acciones originales.
(function installClientNameIdentityLookup(){
  const normalize = value => normalizeClientLookup(value);
  const ownedLots = (clientId,rid) => db.lots.filter(l=>
    l.residenceId===rid && l.type!=='private' && l.status!=='private' &&
    (l.ownerClientId===clientId || db.sales.some(s=>s.clientId===clientId&&s.lotId===l.id))
  );
  const documents = (clientId,rid) => (db.ownershipStatements||[]).filter(s=>
    s.clientId===clientId && s.residenceId===rid
  );
  const related = (c,rid) => ownedLots(c.id,rid).length>0 || documents(c.id,rid).length>0 ||
    db.sales.some(s=>s.clientId===c.id && getLot(s.lotId)?.residenceId===rid);
  const matches = (c,q) => normalize(c.name).includes(q) || normalize(c.identity).includes(q);
  const lotTitle = l => 'Etapa '+(l.stage||'por confirmar')+' · Bloque '+(l.block||'—')+
    ' · Solar '+(l.sourceNumber||l.number||l.id);
  const refTitle = r => 'Etapa '+(r.stage||'por confirmar')+' · Bloque '+(r.block||'—')+
    ' · Solar '+(r.lot||r.solar||r.lotId||'por confirmar');
  function references(c,rid){
    const lots=ownedLots(c.id,rid),docs=documents(c.id,rid);
    const all=[...new Set([...lots.map(lotTitle),...docs.flatMap(d=>(d.references||[]).map(refTitle))])];
    return {lots,docs,all};
  }
  function canRegisterAbono(c,rid,refs){
    return refs.docs.length>0 || db.sales.some(s=>s.clientId===c.id&&getLot(s.lotId)?.residenceId===rid&&balance(s)>.009) ||
      refs.lots.some(l=>l.status==='sold'&&!db.sales.some(s=>s.lotId===l.id));
  }
  function searchWidget(type){
    return '<section class="card" data-name-id-widget="'+type+'" style="padding:16px;margin-bottom:16px;min-width:0">'+
      '<label for="name-id-'+type+'" style="font-weight:750;display:block">Buscar cliente por nombre o cédula</label>'+
      '<input id="name-id-'+type+'" data-name-id-search="'+type+'" type="search" autocomplete="off" '+
      'placeholder="Nombre completo o número de identidad" aria-label="Buscar cliente por nombre o cédula" '+
      'style="display:block;width:100%;max-width:100%;min-height:46px;box-sizing:border-box;margin-top:8px">'+
      '<div id="name-id-results-'+type+'" role="status" aria-live="polite" style="max-height:420px;overflow:auto"></div></section>';
  }
  function injectNearContent(html,type){
    const widget=searchWidget(type),markers=['<div class="cards-four"','<div class="card"','<div class="page-cols">'];
    const marker=markers.find(m=>html.includes(m));
    return marker?html.replace(marker,widget+marker):widget+html;
  }
  const oldLots=lotsPage;
  lotsPage=function(){return injectNearContent(oldLots(),'lots');};
  const oldReceipts=receiptsPage;
  receiptsPage=function(){return injectNearContent(oldReceipts(),'receipts');};
  const oldPayments=paymentsPage;
  paymentsPage=function(){return injectNearContent(oldPayments(),'payments');};
  const oldCollections=collectionPage;
  collectionPage=function(){return injectNearContent(oldCollections(),'collections');};

  function showMatches(type){
    const input=$('[data-name-id-search="'+type+'"]'),out=$('#name-id-results-'+type);
    if(!input||!out)return;
    const q=normalize(input.value),rid=residence().id;
    if(!q){out.innerHTML='<p class="sm muted" style="margin:10px 0 0">Escribe el nombre o la cédula del cliente para ver sus solares.</p>';return;}
    const found=db.clients.filter(c=>matches(c,q)),shown=found.slice(0,60);
    if(!found.length){out.innerHTML='<p class="sm muted">No encontramos clientes con ese nombre o cédula. Revisa los datos escritos.</p>';return;}
    out.innerHTML='<p class="sm muted" style="margin:10px 0">'+found.length+' cliente(s) encontrados'+(found.length>shown.length?' · mostrando los primeros 60':'')+'.</p>'+
      shown.map(c=>{
        const refs=references(c,rid),isRelated=related(c,rid),canPay=isRelated&&canRegisterAbono(c,rid,refs);
        const titles=refs.all.slice(0,12).map(t=>'<span style="display:inline-block;margin:3px 5px 3px 0;padding:5px 7px;border-radius:8px;background:rgba(110,150,120,.10)">'+esc(t)+'</span>').join('');
        const lots=refs.lots.slice(0,12).map(l=>
          '<button class="btn btn-outline btn-sm" type="button" data-action="view-lot" data-id="'+esc(l.id)+'">'+esc(lotTitle(l))+'</button>'
        ).join(' ');
        return '<article class="notice-card" style="margin:9px 0;padding:13px;min-width:0">'+
          '<strong>'+esc(c.name||'Cliente sin nombre')+'</strong><div class="sm">Cédula: '+esc(c.identity||'Pendiente de registrar')+
          (c.phone?' · Tel.: '+esc(c.phone):'')+'</div>'+
          '<div class="sm" style="margin:7px 0">'+(titles||'Sin solares asociados en la residencial activa')+
          (refs.all.length>12?' · y '+(refs.all.length-12)+' más':'')+'</div>'+
          ((type==='collections'||type==='payments')?'<p class="sm"><strong>'+esc(lotigestPrimaLabel(lotigestPrimaStatus(c.id,rid)))+'</strong></p>':'')+
          '<div style="display:flex;flex-wrap:wrap;gap:7px">'+
          '<button type="button" class="btn btn-outline btn-sm" data-action="view-client" data-id="'+esc(c.id)+'">Ver ficha del cliente</button>'+
          (type==='lots'?lots:
            (canPay?'<button type="button" class="btn btn-primary btn-sm" data-action="owner-payment-person" data-id="'+esc(c.id)+'">Registrar abono</button>':''))+
          '</div></article>';
      }).join('');
  }
  // El selector usado al iniciar un abono también permite buscar por cédula.
  renderOwnerCustomers=function(){
    const input=$('#owner-payment-search'),out=$('#owner-payment-customers');if(!input||!out)return;
    input.placeholder='Nombre completo o número de cédula';
    input.setAttribute('aria-label','Buscar cliente por nombre o cédula');
    const q=normalize(input.value),rid=residence().id;
    const people=db.clients.filter(c=>related(c,rid) && (!q || matches(c,q)));
    const missing=people.filter(c=>lotigestPrimaHighlight(lotigestPrimaStatus(c.id,rid)));
    const onlyMissing=ownerPrimaFilter;
    const selected=people.filter(c=>!onlyMissing||lotigestPrimaHighlight(lotigestPrimaStatus(c.id,rid))).slice(0,100);
    out.innerHTML='<label class="pm-prima-filter"><input id="owner-prima-filter" type="checkbox" '+
      (onlyMissing?'checked':'')+'> Mostrar sin prima registrada / incompleta ('+missing.length+')</label>'+
      (selected.map(c=>{
        const refs=references(c,rid),status=lotigestPrimaStatus(c.id,rid);
        return '<button type="button" class="btn btn-outline" data-action="owner-payment-person" data-id="'+esc(c.id)+'" '+
          'style="display:block;width:100%;text-align:left;margin:8px 0;white-space:normal">'+
          '<strong>'+esc(c.name)+'</strong><br><small>Cédula: '+esc(c.identity||'Pendiente')+'</small><br>'+
          '<small>'+esc(refs.all.join(' · ')||'Referencia del solar pendiente de completar')+'</small><br>'+
          '<span class="pm-prima-tag '+(lotigestPrimaHighlight(status)?'pm-prima-tag-red':'pm-prima-tag-neutral')+'">'+
          esc(lotigestPrimaLabel(status))+'</span></button>';
      }).join('') || '<p>No encontramos clientes con ese nombre o cédula en esta residencial.</p>');
  };
  const oldPicker=openOwnerCustomerPicker;
  openOwnerCustomerPicker=function(...args){
    const result=oldPicker(...args);
    const field=$('#owner-payment-search');
    if(field){const label=field.closest('label');if(label?.firstChild?.nodeType===3)label.firstChild.textContent='Buscar cliente por nombre o cédula';}
    return result;
  };
  // La ventana clásica de pagos con venta y saldo también reconoce cédula.
  const oldCandidates=paymentCandidates;
  paymentCandidates=function(q=''){
    const original=oldCandidates(q),query=normalize(q);
    if(!query)return original;
    const byIdentity=oldCandidates().filter(s=>normalize(getClient(s.clientId)?.identity).includes(query));
    return [...new Map([...original,...byIdentity].map(s=>[s.id,s])).values()];
  };
  const oldBasePayment=baseNewPayment;
  baseNewPayment=function(...args){
    const result=oldBasePayment(...args),input=$('#multi-payment-search');
    if(input){input.placeholder='Nombre o cédula del cliente';input.setAttribute('aria-label','Buscar cliente por nombre o cédula');}
    const label=document.querySelector('label[for="multi-payment-search"]');
    if(label)label.textContent='Buscar cliente por nombre o cédula, bloque o solar';
    return result;
  };
  document.addEventListener('input',e=>{
    const type=e.target?.dataset?.nameIdSearch;
    if(type && ['lots','payments','receipts','collections'].includes(type))showMatches(type);
  });
})();