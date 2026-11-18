(function installManualOwnerHistory(){
  const previousGroups=collectionOwnershipGroups;
  const previousProperties=ownerClientProperties;
  const previousHistory=ownerClientHistory;
  const previousAbono=openOwnerAbono;
  const previousPayment=newPayment;
  const previousContractsPage=contractsPage;
  const previousClientView=viewClient;
  let historyDraft=null;

  function ownerLots(clientId,rid,withoutSale=false){
    return db.lots.filter(l=>l.residenceId===rid && l.type!=='private' && l.status!=='private' && (l.ownerClientId===clientId || db.sales.some(s=>s.lotId===l.id&&s.clientId===clientId)) && (!withoutSale||!db.sales.some(s=>s.lotId===l.id)));
  }
  function legalLot(l,clientId,rid){
    return l && l.residenceId===rid && l.ownerClientId===clientId && l.status==='sold' && l.type!=='private' && !db.sales.some(s=>s.lotId===l.id);
  }
  function uniqueRefs(ids){
    return ids.map(id=>getLot(id)).filter(Boolean).map(l=>'Etapa '+(l.stage||'por confirmar')+' · Bloque '+l.block+' · Solar '+(l.sourceNumber||l.number||l.id));
  }
  function manualOwnerName(id){return getClient(id)?.name||'Propietario';}
  function contractOwners(rid){
    return db.clients.filter(c=>ownerLots(c.id,rid).length || (db.ownershipStatements||[]).some(s=>s.clientId===c.id&&s.residenceId===rid));
  }

  collectionOwnershipGroups=function(rid){
    const groups=previousGroups(rid);
    for(const l of db.lots){
      if(l.residenceId!==rid||!l.ownerClientId||l.status!=='sold'||l.type==='private')continue;
      if(db.sales.some(s=>s.lotId===l.id)||groups.some(g=>g.lotIds.includes(l.id)))continue;
      groups.push({key:'owner-lot:'+l.id,stage:l.stage||null,block:l.block,solar:String(l.sourceNumber||l.number||''),statements:[{id:'owner-lot:'+l.id,clientId:l.ownerClientId,clientName:manualOwnerName(l.ownerClientId)}],lotIds:[l.id],candidateIds:[l.id],missing:false});
    }
    return groups;
  };
  ownerClientProperties=function(clientId,rid){
    const result=previousProperties(clientId,rid);
    for(const l of ownerLots(clientId,rid)){
      const key=(l.stage||'pending')+':'+l.block+':'+(l.sourceNumber||l.number||l.id);
      if(!result.refs.some(r=>r.key===key))result.refs.push({key,stage:l.stage||null,block:l.block,lot:String(l.sourceNumber||l.number||l.id),lotId:l.id,candidateLotIds:[l.id]});
    }
    return result;
  };
  ownerClientHistory=function(clientId,rid){
    const docs=(db.ownershipStatements||[]).filter(s=>s.clientId===clientId&&s.residenceId===rid);
    if(docs.length || (db.historicalPayments||[]).some(p=>p.clientId===clientId&&p.residenceId===rid))return previousHistory(clientId,rid);
    const lots=ownerLots(clientId,rid);
    const pays=(db.ownerPayments||[]).filter(p=>p.clientId===clientId&&p.residenceId===rid).slice().sort((a,b)=>a.date.localeCompare(b.date));
    return `<section data-owner-ficha-history><h3>Terrenos del propietario</h3><p>${lots.map(l=>esc('Etapa '+(l.stage||'pendiente')+' · Bloque '+l.block+' · Solar '+(l.sourceNumber||l.number||l.id))).join('<br>')||'Por confirmar'}</p><p>Precio, cuotas y saldo por verificar en el contrato original. No se generan moras ni saldos automáticos sin condiciones confirmadas.</p><h3>Primas y abonos ingresados manualmente</h3><div class="table-scroll"><table><thead><tr><th>Fecha</th><th>Concepto</th><th>Solares</th><th>Monto</th><th>Recibo</th></tr></thead><tbody>${pays.map(p=>`<tr><td>${fmtDate(p.date)}</td><td>${esc(p.concept)}</td><td>${p.allocations.flatMap(a=>a.references.map(r=>esc(r.block+' / '+r.solar))).join(' · ')}</td><td>${money(p.amountCents/100)}</td><td><button class="btn btn-outline btn-sm" data-action="owner-payment-receipt" data-id="${esc(p.id)}">Ver</button></td></tr>`).join('')||'<tr><td colspan="5">Aún no hay pagos registrados en este propietario.</td></tr>'}</tbody></table></div></section>`;
  };
  renderOwnerCustomers=function(){
    const out=$('#owner-payment-customers');if(!out)return;
    const rid=residence().id,search=normalizeClientLookup($('#owner-payment-search')?.value||'');
    const clients=contractOwners(rid).concat(db.clients.filter(c=>db.sales.some(s=>s.clientId===c.id&&getLot(s.lotId)?.residenceId===rid)&&!contractOwners(rid).some(x=>x.id===c.id)));
    out.innerHTML=clients.filter(c=>!search||normalizeClientLookup(c.name).includes(search)).slice(0,100).map(c=>`<button class="btn btn-outline" style="display:block;width:100%;text-align:left;margin:8px 0;white-space:normal" data-action="owner-payment-person" data-id="${esc(c.id)}"><strong>${esc(c.name)}</strong><br>${esc(ownerClientSolarSummary(c.id,rid).label)}<br>${ownerLots(c.id,rid).map(l=>esc('Etapa '+(l.stage||'pendiente')+' · '+l.block+' / '+(l.sourceNumber||l.id))).join(' · ')}</button>`).join('')||'<p>No se encontraron propietarios en esta residencial.</p>';
  };
  newPayment=function(saleId,useOcr=false){
    if(!saleId&&!useOcr && contractOwners(residence().id).length){openOwnerCustomerPicker();return;}
    return previousPayment(saleId,useOcr);
  };
  openOwnerAbono=function(clientId,requestedResidenceId=null){
    const rid=requestedResidenceId||residence().id;
    const docs=(db.ownershipStatements||[]).filter(s=>s.clientId===clientId&&s.residenceId===rid);
    const outstanding=db.sales.some(s=>s.clientId===clientId&&getLot(s.lotId)?.residenceId===rid&&balance(s)>.009);
    if(!docs.length&&!outstanding&&ownerLots(clientId,rid,true).length){openHistoricalManual(clientId,rid);return;}
    return previousAbono(clientId,requestedResidenceId);
  };

  function openHistoricalPicker(){
    const rid=residence().id;
    showModal('Contratos · Registrar prima o abono anterior',`<p>Selecciona un propietario que ya tenga terreno registrado. Puedes recuperar pagos de 2024 u otros meses anteriores con su fecha real; no se crea una venta ni una deuda por suposición.</p><label>Buscar persona<input id="manual-history-search" placeholder="Buscar por nombre" autocomplete="off"></label><div id="manual-history-owners" style="max-height:360px;overflow:auto"></div>`,'<button class="btn btn-soft" data-action="close-modal">Cerrar</button>',true);
    renderHistoricalPicker();
  }
  function renderHistoricalPicker(){
    const target=$('#manual-history-owners');if(!target)return;
    const rid=residence().id,term=normalizeClientLookup($('#manual-history-search')?.value||'');
    target.innerHTML=contractOwners(rid).filter(c=>!term||normalizeClientLookup(c.name).includes(term)).slice(0,100).map(c=>`<button class="btn btn-outline" style="display:block;width:100%;text-align:left;margin:8px 0;white-space:normal" data-action="manual-history-person" data-id="${esc(c.id)}"><strong>${esc(c.name)}</strong> · ${esc(ownerClientSolarSummary(c.id,rid).label)}</button>`).join('')||'<p>No hay propietarios vinculados a solares de esta residencial.</p>';
  }

  function openHistoricalManual(clientId,rid=residence().id){
    const c=getClient(clientId);
    if(!c)return;
    const existing=(db.ownershipStatements||[]).filter(s=>s.clientId===clientId&&s.residenceId===rid);
    if(existing.length){previousAbono(clientId,rid);return;}
    const lots=ownerLots(clientId,rid,true).filter(l=>legalLot(l,clientId,rid));
    if(!lots.length){const sale=db.sales.find(s=>s.clientId===clientId&&getLot(s.lotId)?.residenceId===rid&&balance(s)>.009);if(sale){previousAbono(clientId,rid);return;}toast('No hay terrenos vendidos vinculados a este propietario para registrar este historial.','error');return;}
    historyDraft={clientId,residenceId:rid,snapshot:JSON.stringify(db),id:'OP-'+crypto.randomUUID(),statementId:'OS-'+crypto.randomUUID()};
    const checks=lots.map(l=>`<label style="display:block;padding:7px 2px"><input type="checkbox" data-manual-lot value="${esc(l.id)}" ${lots.length===1?'checked':''}> ${esc('Etapa '+(l.stage||'por confirmar')+' · Bloque '+l.block+' · Solar '+(l.sourceNumber||l.number||l.id))}</label>`).join('');
    showModal('Contratos · Registrar prima o abono histórico',`<p><strong>${esc(c.name)}</strong></p><p>Marca el solar o los solares a los que corresponde el pago. Si marcas varios, se conservará como <strong>un solo pago conjunto</strong>, sin repartirlo ni duplicarlo.</p><form id="manual-history-form" data-owner-client-id="${esc(clientId)}"><div style="max-height:220px;overflow:auto">${checks}</div><div class="form-grid">${field('Fecha real del pago','date',businessToday(),{type:'date',required:true})}<label>Tipo de pago<select name="type" required><option value="PRIMA">Prima</option><option value="ABONO" selected>Abono</option></select></label>${field('Monto recibido (L.)','amount','',{type:'number',min:'.01',step:'.01',required:true})}${receiptMethodField()}${receiptReferenceField()}<label>Mes al que corresponde (opcional)<input type="month" name="period"></label>${field('Referencia o nota del recibo','note','',{full:true})}</div>${receiptOcrWidget()}<p>Los pagos anteriores se registran en su fecha original. Sin precio y plazo comprobados, el saldo y la mora quedan pendientes de verificar.</p><label><input type="checkbox" name="reviewed" required> Confirmé el recibo original, propietario, solares y que este pago no está registrado anteriormente.</label><p id="manual-history-error" role="alert"></p></form>`,'<button class="btn btn-soft" data-action="close-modal">Cancelar</button><button class="btn btn-primary" type="submit" form="manual-history-form">Guardar y generar recibo</button>',true);
  }

  async function submitHistoricalManual(form){
    const error=$('#manual-history-error'),button=document.querySelector('[form="manual-history-form"]');
    try{
      if(!historyDraft||historyDraft.snapshot!==JSON.stringify(db))throw Error('Los datos cambiaron. Vuelve a abrir el registro para no sobrescribir pagos.');
      const fields=Object.fromEntries(new FormData(form));
      if(fields.reviewed!=='on')throw Error('Confirma que revisaste el recibo.');
      const ids=[...new Set([...form.querySelectorAll('[data-manual-lot]:checked')].map(i=>i.value))];
      if(!ids.length||ids.length>30)throw Error('Selecciona entre 1 y 30 solares del propietario.');
      const lots=ids.map(id=>getLot(id));if(lots.some(l=>!legalLot(l,historyDraft.clientId,historyDraft.residenceId)))throw Error('El solar ya no está asignado a esta persona. Revisa su contrato.');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(fields.date)||fields.date>businessToday()||Number.isNaN(Date.parse(fields.date+'T12:00:00Z')))throw Error('Indica la fecha real del pago, no posterior a hoy.');
      if(!['PRIMA','ABONO'].includes(fields.type))throw Error('Selecciona Prima o Abono.');
      if(fields.period&&!/^\d{4}-\d{2}$/.test(fields.period))throw Error('Mes de cuota inválido.');
      const cents=Math.round(Number(fields.amount)*100);
      if(!Number.isSafeInteger(cents)||cents<=0||Math.abs(Number(fields.amount)*100-cents)>0.00001)throw Error('El monto debe ser mayor que cero y tener hasta dos decimales.');
      const note=String(fields.note||'').trim().slice(0,180);
      const concept=(fields.type==='PRIMA'?'Prima histórica':'Abono histórico')+(fields.period?' · Mes '+fields.period:'')+(note?' · '+note:'');
      const duplicate=(db.ownerPayments||[]).some(p=>p.clientId===historyDraft.clientId&&p.date===fields.date&&p.amountCents===cents&&String(p.concept).startsWith(fields.type==='PRIMA'?'Prima':'Abono')&&ids.every(id=>p.allocations.some(a=>a.references.some(r=>r.lotId===id))));
      if(duplicate)throw Error('Ya existe un pago con igual fecha, monto y solar(es). Revisa el historial antes de continuar; no se duplicó.');
      if(button)button.disabled=true;
      const next=JSON.parse(JSON.stringify(db));
      next.ownershipStatements??=[];
      next.ownershipStatements.push({id:historyDraft.statementId,residenceId:historyDraft.residenceId,clientId:historyDraft.clientId,clientName:manualOwnerName(historyDraft.clientId),sourceName:'Registro manual de Contratos',rawReference:{block:lots.map(l=>l.block).join(', '),lot:lots.map(l=>String(l.sourceNumber||l.number||l.id)).join(', ')},references:lots.map(l=>({stage:l.stage||null,block:String(l.block),lot:String(l.sourceNumber||l.number||l.id),lotId:l.id,candidateLotIds:[l.id]})),issues:[],documentedDownPaymentCents:null,documentedOpeningBalanceCents:null,documentedBalances:[],paymentIds:[],contractIds:[],manual:true,importedAt:new Date().toISOString()});
      const outcome=lotigestOwnerPayments.createOwnerPayment(next,{id:historyDraft.id,clientId:historyDraft.clientId,residenceId:historyDraft.residenceId,date:fields.date,method:String(fields.method||'Efectivo').trim(),concept,receiptRef:String(fields.receiptRef||'').trim(),reviewed:true,allocations:[{statementId:historyDraft.statementId,referenceIndex:null,amount:fields.amount}]});
      cloudWrite(JSON.stringify(outcome.state));
      db=outcome.state;historyDraft=null;
      closeModal();page='receipts';render();ownerPaymentPreview(outcome.receipt.id);
      await cloudFlush();
      if(cloudBlocked||cloudQueue?.pending||cloudQueue?.latest!==cloudQueue?.confirmed)toast('Recibo creado en el equipo, pero el guardado en D1 está pendiente. Revisa la sincronización.','error');
      else toast('Prima o abono histórico guardado en D1 con su fecha real.');
    }catch(e){
      if(error)error.textContent=e.message||'No se pudo guardar.';
      else toast(e.message||'No se pudo guardar.','error');
      if(button)button.disabled=false;
    }
  }

  contractsPage=function(){
    return `<section class="card card-padding" style="margin:0 0 16px"><h3>Primas y abonos de meses anteriores</h3><p>Registra pagos manuales desde el contrato o la ficha del propietario, usando su fecha real. Un pago conjunto entre varios solares se registra una sola vez. Los saldos y moras requieren precio y condiciones verificadas.</p><button class="btn btn-primary" data-action="manual-history-picker">Registrar prima / abono histórico</button></section>`+previousContractsPage();
  };
  viewClient=function(id){
    previousClientView(id);
    const c=getClient(id);if(!c)return;
    const lots=ownerLots(id,residence().id,true);
    const docs=(db.ownershipStatements||[]).some(s=>s.clientId===id&&s.residenceId===residence().id);
    if(!lots.length||docs)return;
    const root=$('#modal-root .modal-content');if(!root)return;
    const bought=[...root.querySelectorAll('.detail-line')].find(x=>x.querySelector('span')?.textContent==='Terrenos comprados');
    if(bought?.querySelector('strong'))bought.querySelector('strong').textContent=lots.map(l=>l.id).join(' · ');
    const receivable=[...root.querySelectorAll('.detail-line')].find(x=>x.querySelector('span')?.textContent==='Cartera por cobrar');
    if(receivable?.querySelector('strong')&&!db.sales.some(s=>s.clientId===id))receivable.querySelector('strong').textContent='Sin condiciones contractuales verificadas';
    root.insertAdjacentHTML('beforeend',ownerClientHistory(id,residence().id)+`<button class="btn btn-primary" data-action="manual-history-person" data-id="${esc(id)}">Registrar prima / abono anterior</button>`);
  };
  document.addEventListener('input',e=>{if(e.target.id==='manual-history-search')renderHistoricalPicker();});
  document.addEventListener('submit',e=>{if(e.target.id==='manual-history-form'){e.preventDefault();submitHistoricalManual(e.target);}});
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-action]');if(!b)return;
    if(b.dataset.action==='manual-history-picker')openHistoricalPicker();
    if(b.dataset.action==='manual-history-person')openHistoricalManual(b.dataset.id);
  });
})();
