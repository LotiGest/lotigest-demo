let collectionOwnersInitialized=false,collectionStageFilter='all';
function collectionOwnerStatements(rid){return (db.ownershipStatements||[]).filter(s=>s.residenceId===rid);}
function collectionPage (){if(!collectionOwnersInitialized&&(db.ownershipStatements||[]).length){collectionFilter='all';collectionOwnersInitialized=true;}return `<div class="card" style="padding:14px;margin-bottom:16px"><label>Filtrar fichas por etapa <select id="collection-stage-filter"><option value="all">Todas las etapas</option>${[1,2].map(n=>`<option value="${n}" ${collectionStageFilter===String(n)?'selected':''}>Etapa ${n}</option>`).join('')}<option value="pending" ${collectionStageFilter==='pending'?'selected':''}>Etapa por confirmar</option></select></label></div>`+baseCollectionPage();}
function collectionOwnershipGroups(rid){const groups=new Map();for(const s of collectionOwnerStatements(rid)){if(!s.references.length){const key='missing:'+s.id;groups.set(key,{key,block:String(s.rawReference.block||'Por confirmar'),solar:String(s.rawReference.lot||'Por confirmar'),statements:[s],lotIds:[],candidateIds:[],missing:true});continue;}for(const r of s.references){const key=((r.stage||getLot(r.lotId)?.stage)?(r.stage||getLot(r.lotId)?.stage)+':':'')+r.block+':'+r.lot;if(!groups.has(key))groups.set(key,{key,stage:r.stage||getLot(r.lotId)?.stage||null,block:r.block,solar:String(r.lot),statements:[],lotIds:[],candidateIds:[],missing:false});const g=groups.get(key);if(!g.statements.some(x=>x.id===s.id))g.statements.push(s);if(r.lotId&&!g.lotIds.includes(r.lotId))g.lotIds.push(r.lotId);for(const id of r.candidateLotIds||[])if(!g.candidateIds.includes(id))g.candidateIds.push(id);}}for(const c of db.historicalContracts||[]){if(c.residenceId!==rid||(db.ownershipStatements||[]).some(s=>(s.contractIds||[]).includes(c.id)))continue;const rows=(db.historicalPayments||[]).filter(p=>p.contractId===c.id),refs=c.references?.length?c.references:[{stage:c.stage||null,block:c.block,lot:c.lot,lotId:rows.find(p=>p.lotId)?.lotId||null,candidateLotIds:[...new Set(rows.flatMap(p=>p.candidateLotIds||[]))]}];for(const ref of refs){if(!ref.block||!/^\d+$/.test(String(ref.lot||'')))continue;const stage=ref.stage||getLot(ref.lotId)?.stage||null,key=(stage?stage+':':'')+ref.block+':'+Number(ref.lot);if(!groups.has(key))groups.set(key,{key,stage,block:ref.block,solar:String(Number(ref.lot)),statements:[],lotIds:[],candidateIds:[],missing:false});const g=groups.get(key);if(!g.statements.some(s=>s.id===c.id))g.statements.push({...c,generic:true});if(ref.lotId&&!rows.some(p=>p.issues.includes('owner_conflict'))&&!g.lotIds.includes(ref.lotId))g.lotIds.push(ref.lotId);for(const id of ref.candidateLotIds||[])if(!g.candidateIds.includes(id))g.candidateIds.push(id);}}return [...groups.values()];}
function collectionOwnershipCard(g,rid,lot=null){const owners=[...new Set(g.statements.map(s=>s.clientId).filter(Boolean))],clients=owners.map(getClient).filter(Boolean),confirmed=lot&&g.lotIds.includes(lot.id),title=confirmed?lot.id:'Solar '+g.solar,who=clients.map(c=>esc(c.name)+'<br><span class="sm">'+esc(ownerClientSolarSummary(c.id,rid).label)+'</span>').join('<br>'),phones=clients.map(c=>c.phone).filter(Boolean),token=encodeURIComponent(JSON.stringify([rid,g.key]));return `<article class="card collection-owner-card" data-owner-card="${esc(g.key)}" style="border-top:5px solid ${confirmed?'#0a9b71':'#ce8220'};border-radius:10px;padding:15px;box-shadow:none"><strong style="font-size:19px">${esc(title)}</strong> · ${g.stage?'Etapa '+esc(g.stage):'Etapa por confirmar'} · Bloque ${esc(g.block)}<p><span style="color:${confirmed?'#087a5b':'#a96a16'};font-weight:750">${confirmed?'Propietario registrado':'Propietario según Excel'}</span></p><p class="sm"><strong>${who||esc(g.statements[0]?.clientName||'Por verificar')}</strong>${phones.length?'<br>'+phones.map(esc).join(' · '):''}<br>${lot?inventoryArea(lot)+' m² · '+inventoryPrice(lot):'Medidas y precio dentro de la ficha'}</p><p class="sm">${confirmed?'Primas, abonos y saldos en Ficha.':g.missing?'Completar identificación del bloque o solar.':'Código exacto del mapa por confirmar.'}<br>Cuotas del mes y mora: por verificar.</p><div style="display:flex;gap:6px;flex-wrap:wrap">${lot?'<button class="btn btn-outline btn-sm" data-action="geo-bind" data-id="'+esc(lot.id)+'">Ubicar en GPS</button>':''}<button class="btn btn-soft btn-sm" data-action="collection-owner-ficha" data-id="${esc(token)}">Ficha</button><button class="btn btn-primary btn-sm" data-action="collection-owner-abono" data-id="${esc(token)}">Abonar</button></div></article>`;}
function ordinaryCollectionCard(x){return `<article class="card" style="border-top:5px solid ${ledgerStyles[x.code][1]};border-radius:10px;padding:15px;box-shadow:none"><strong style="font-size:19px">${esc(x.lot.id)}</strong> · Etapa ${esc(x.lot.stage||'por confirmar')} · Bloque ${esc(x.lot.block)}<p>${ledgerBadge(x)}</p><p class="sm">${esc(x.client?.name||'Sin comprador registrado')}<br>${esc(x.client?.phone||'')}<br>${inventoryArea(x.lot)} m² · ${inventoryPrice(x.lot)}</p><p class="sm">Mes: <b>${money(x.monthAmount)}</b><br>Vencido: <b>${money(x.lateAmount)}</b>${x.oldest?'<br>Primera cuota vencida: '+fmtDate(x.oldest):''}</p><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-outline btn-sm" data-action="geo-bind" data-id="${esc(x.lot.id)}">${x.lot.geo?.length?'Ver en GPS':'Ubicar en GPS'}</button><button class="btn btn-soft btn-sm" data-action="view-lot" data-id="${esc(x.lot.id)}">Ficha</button>${x.sale?.type==='credit'?'<button class="btn btn-primary btn-sm" data-action="new-payment" data-id="'+esc(x.sale.id)+'">Abonar</button>':''}${x.current.length||x.overdue.length?contactLink(x):''}</div></article>`;}
function collectionSolarCards(list,rid){const groups=collectionOwnershipGroups(rid).filter(g=>collectionStageFilter==='all'||(g.stage?String(g.stage):'pending')===collectionStageFilter);list=list.filter(x=>collectionStageFilter==='all'||String(x.lot.stage)===collectionStageFilter);const showOwners=collectionFilter==='all',done=new Set(),cards=[];for(const x of list){const exact=groups.find(g=>g.lotIds.includes(x.lot.id));if(exact&&!x.sale&&showOwners){cards.push(collectionOwnershipCard(exact,rid,x.lot));done.add(exact.key);continue;}const pending=showOwners&&!x.sale&&groups.find(g=>!g.missing&&!g.lotIds.length&&g.candidateIds.includes(x.lot.id));if(pending){if(!done.has(pending.key)){cards.push(collectionOwnershipCard(pending,rid));done.add(pending.key);}continue;}cards.push(ordinaryCollectionCard(x));}if(showOwners)for(const g of groups)if(!done.has(g.key)&&!g.lotIds.length)cards.push(collectionOwnershipCard(g,rid));return cards.join('');}
function collectionGroupFromToken(token){try{const [rid,key]=JSON.parse(decodeURIComponent(token));return {rid,group:collectionOwnershipGroups(rid).find(g=>g.key===key)};}catch{return {};}}
function ownerClientProperties(clientId,rid){const docs=collectionOwnerStatements(rid).filter(s=>s.clientId===clientId),refs=[],add=r=>{const stage=r.stage||getLot(r.lotId)?.stage||null,key=(stage||'pending')+':'+r.block+':'+r.lot;if(!refs.some(x=>x.key===key))refs.push({...r,stage,key});};for(const s of docs)for(const r of s.references)add(r);for(const c of db.historicalContracts||[]){if(c.clientId!==clientId||c.residenceId!==rid||docs.some(s=>(s.contractIds||[]).includes(c.id)))continue;if(c.references?.length)c.references.forEach(add);else for(const g of collectionOwnershipGroups(rid))if(g.statements.some(s=>s.id===c.id))add({stage:g.stage,block:g.block,lot:g.solar,lotId:g.lotIds[0]||null});}return {docs,refs};}
function ownerClientHistory(clientId,rid){const {docs,refs}=ownerClientProperties(clientId,rid),ids=new Set(docs.flatMap(s=>s.paymentIds||[])),rows=(db.historicalPayments||[]).filter(p=>ids.has(p.id)||(p.clientId===clientId&&p.residenceId===rid)),newRows=(db.ownerPayments||[]).filter(p=>p.clientId===clientId&&p.residenceId===rid);return `<section data-owner-ficha-history><h3>${ownerClientSolarSummary(clientId,rid).label}</h3><p>${refs.map(r=>'<strong>Etapa '+esc(r.stage||getLot(r.lotId)?.stage||'por confirmar')+' · Bloque '+esc(r.block)+' · Solar '+esc(r.lot)+'</strong>'+(r.lotId?' · '+esc(r.lotId):' · Código del mapa pendiente')).join('<br>')||'La ficha del Excel no identifica por completo el bloque y solar.'}</p><h3>Primas y abonos</h3><p>Los movimientos del Excel se conservan una sola vez. Cuando una ficha corresponde a varios solares, su monto es conjunto y no se repite por cada terreno.</p>${docs.map(s=>`<div class="notice-card" style="margin:10px 0"><strong>${s.references.map(r=>esc(r.block+' / '+r.lot)).join(' · ')||'Referencia por completar'}</strong><br>Prima documentada: ${s.documentedDownPaymentCents==null?'Por verificar':money(s.documentedDownPaymentCents/100)} · Saldo inicial documentado: ${s.documentedOpeningBalanceCents==null?'Por verificar':money(s.documentedOpeningBalanceCents/100)}<br>Saldo documentado disponible de la ficha: ${lotigestOwnerPayments.ownerStatementBalance(db,s)==null?'Por verificar':money(lotigestOwnerPayments.ownerStatementBalance(db,s)/100)}<br><button class="btn btn-outline btn-sm" data-action="owner-statement" data-id="${esc(s.id)}">Ver detalle y revisar asignación</button></div>`).join('')}<div class="table-scroll"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Monto</th><th>Mes recibido</th><th>Mensualidad asignada</th><th>Etapa</th><th>Bloque</th><th>Solar(es)</th><th>Revisión</th></tr></thead><tbody>${rows.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))).map(p=>`<tr><td>${p.date?fmtDate(p.date):esc(p.sourceRaw?.date||'Por verificar')}</td><td>${esc(p.type)}</td><td>${p.amountCents==null?esc(p.sourceRaw?.amount||'Por verificar'):money(p.amountCents/100)}</td><td>${esc(p.date?.slice(0,7)||'Por verificar')}</td><td>${esc(p.period||'Pendiente de revisar')}</td><td>${esc(p.stage||p.references?.[0]?.stage||getLot(p.lotId)?.stage||'Por confirmar')}</td><td>${esc(p.block||'')}</td><td>${esc(p.lot||'')}</td><td>${p.issues.filter(i=>!['source_needs_review','missing_contract','missing_lot','ambiguous_lot'].includes(i)).map(i=>esc(lotigestLedger.historyIssueLabels[i]||i)).join('; ')||'Conservado desde Excel'}${!p.postedPaymentId?' <button class="btn btn-soft btn-sm" data-action="ledger-row-edit" data-id="'+esc(p.id)+'">Revisar fila</button>':''}</td></tr>`).join('')||'<tr><td colspan="9">Sin movimientos históricos.</td></tr>'}${newRows.map(p=>`<tr><td>${fmtDate(p.date)}</td><td>${esc(p.concept?.startsWith('Prima')?'Prima registrada':'Abono registrado')}</td><td>${money(p.amountCents/100)}</td><td>${esc(p.date?.slice(0,7)||'Por verificar')}</td><td>${esc(String(p.concept||'').match(/\bMes\s+((?:19|20)\d{2}-(?:0[1-9]|1[0-2]))\b/i)?.[1]||'Pendiente de revisar')}</td><td>${[...new Set(p.allocations.flatMap(a=>a.references.map(r=>esc(r.stage||getLot(r.lotId)?.stage||'Por confirmar'))))].join(' · ')}</td><td>${[...new Set(p.allocations.flatMap(a=>a.references.map(r=>esc(r.block))))].join(' · ')}</td><td>${p.allocations.flatMap(a=>a.references.map(r=>esc(r.solar))).join(', ')}</td><td><button class="btn btn-outline btn-sm" data-action="owner-payment-receipt" data-id="${esc(p.id)}">Ver recibo</button></td></tr>`).join('')}</tbody></table></div>${!docs.length?(db.historicalContracts||[]).filter(c=>c.clientId===clientId&&c.residenceId===rid).map(c=>'<button class="btn btn-outline" data-action="ledger-contract" data-id="'+esc(c.id)+'">Ver contrato '+esc(c.externalId||'sin referencia')+'</button>').join(''):''}</section>`;}
function collectionOwnerFicha(token,selectedClientId=null){const {rid,group:g}=collectionGroupFromToken(token);if(!g)return;const clients=[...new Set(g.statements.map(s=>s.clientId).filter(Boolean))];if(clients.length>1&&!selectedClientId){showModal('Seleccionar ficha del propietario',`<p>El Excel identifica más de una persona con esta referencia. Confirma su terreno dentro de la ficha.</p>${clients.map(id=>'<button class="btn btn-outline" data-action="collection-owner-person-ficha" data-token="'+esc(token)+'" data-id="'+esc(id)+'">'+esc(getClient(id)?.name||id)+'</button>').join('')}`);return;}const id=selectedClientId||clients[0],c=getClient(id);if(!c)return;showModal('Ficha · Bloque '+esc(g.block)+' · Solar '+esc(g.solar),`<h2>${esc(c.name)}</h2><p><strong>${esc(ownerClientSolarSummary(id,rid).label)}</strong></p><p>${esc(c.phone||'Sin teléfono registrado')}</p>${!g.lotIds.length?'<p class="notice-card">Referencia de las celdas del Excel. Falta confirmar el código físico del mapa; los terrenos originales siguen conservados.</p>':''}${g.lotIds.length===1&&getLot(g.lotIds[0])?officialMeasures(getLot(g.lotIds[0])):g.candidateIds.length?'<details><summary>Ver registros del mapa con esta referencia</summary><p>'+g.candidateIds.map(id=>esc(id)+' · '+inventoryArea(getLot(id))+' m² · '+inventoryPrice(getLot(id))).join('<br>')+'</p></details>':''}${ownerClientHistory(id,rid)}`,'<button class="btn btn-soft" data-action="close-modal">Cerrar</button><button class="btn btn-primary" data-action="owner-payment-person" data-residence="'+esc(rid)+'" data-id="'+esc(id)+'">'+(ownerClientSolarSummary(id,rid).count===1?'Abonar a su solar':'Abonar a sus solares')+'</button>',true);}
function viewLot (id){if(cloudUser?.role==='sales'){lotClientCard(id);return;}const l=getLot(id);if(!l)return;const groups=collectionOwnershipGroups(l.residenceId),g=groups.find(g=>g.lotIds.includes(id));if(g&&!db.sales.some(s=>s.lotId===id)){collectionOwnerFicha(encodeURIComponent(JSON.stringify([l.residenceId,g.key])),l.ownerClientId);return;}baseViewLot(id);const c=db.sales.find(s=>s.lotId===id)?.clientId;if(c&&(db.historicalPayments||[]).some(p=>p.clientId===c)){const content=$('#modal-root .modal-content');content.insertAdjacentHTML('beforeend',ownerClientHistory(c,l.residenceId));}}
function viewClient (id){baseViewClient(id);const c=getClient(id);if(!c)return;const rids=[...new Set([...(db.ownershipStatements||[]).filter(s=>s.clientId===id).map(s=>s.residenceId),...(db.historicalPayments||[]).filter(p=>p.clientId===id).map(p=>p.residenceId)])],content=$('#modal-root .modal-content');if(!content)return;if(rids.length){const refs=rids.flatMap(rid=>ownerClientProperties(id,rid).refs.map(r=>'Bloque '+r.block+' · Solar '+r.lot+(r.lotId?' · '+r.lotId:'')));for(const line of content.querySelectorAll('.detail-line')){const title=line.querySelector('span')?.textContent,strong=line.querySelector('strong');if(title==='Terrenos comprados'&&strong&&refs.length)strong.textContent=refs.join('; ');if(title==='Cartera por cobrar'&&strong&&!db.sales.some(s=>s.clientId===id))strong.textContent='Ver el saldo documentado de cada ficha';}}for(const rid of rids)content.insertAdjacentHTML('beforeend','<h3>'+esc(residenceName(rid))+'</h3>'+ownerClientHistory(id,rid)+'<button class="btn btn-primary" data-action="owner-payment-person" data-residence="'+esc(rid)+'" data-id="'+esc(id)+'">'+(ownerClientSolarSummary(id,rid).count===1?'Abonar a su solar':'Abonar a sus solares')+'</button>');}
document.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b)return;if(b.dataset.action==='collection-owner-ficha')collectionOwnerFicha(b.dataset.id);if(b.dataset.action==='collection-owner-person-ficha')collectionOwnerFicha(b.dataset.token,b.dataset.id);if(b.dataset.action==='collection-owner-abono'){const {rid,group:g}=collectionGroupFromToken(b.dataset.id);if(!g)return;const clients=[...new Set(g.statements.map(s=>s.clientId).filter(Boolean))];if(clients.length===1)openOwnerAbono(clients[0],rid);else{db.currentResidence=rid;openOwnerCustomerPicker();}}});

function ownerClientSolarSummary(clientId,rid){const {docs,refs}=ownerClientProperties(clientId,rid),keys=new Set(refs.filter(r=>r.block&&r.lot).map(r=>String(r.stage||getLot(r.lotId)?.stage||'pending')+':'+String(r.block).trim().toUpperCase()+':'+String(r.lot).replace(/^0+(?=\d)/,'')));for(const sale of db.sales.filter(s=>s.clientId===clientId&&getLot(s.lotId)?.residenceId===rid)){const l=getLot(sale.lotId);keys.add(String(l.stage||'pending')+':'+String(l.block).trim().toUpperCase()+':'+String(l.sourceNumber||l.id).replace(/^0+(?=\d)/,''));}let pending=false;for(const s of docs.filter(s=>!s.references.length)){const raw=String(s.rawReference?.lot??'').trim().toUpperCase();if(docs.length===1&&/^\d+(?:\s*(?:,|Y|\/|&)\s*\d+)*$/.test(raw)){const ns=new Set(raw.split(/\s*(?:,|Y|\/|&)\s*/).map(Number));return {count:ns.size,label:ns.size===1?'1 solar según Excel':ns.size+' solares según Excel'};}pending=true;}if(pending)return {count:null,label:keys.size?'Al menos '+keys.size+(keys.size===1?' solar':' solares')+' · referencias por completar':'Cantidad de solares por confirmar'};const count=keys.size;return {count,label:count===1?'1 solar según Excel':count?count+' solares según Excel':'Sin solar identificado'};}

document.addEventListener('change',e=>{if(e.target.id==='collection-stage-filter'){collectionStageFilter=e.target.value;render();}if(e.target.id==='ar-stage-filter'){arrayanStageFilter=e.target.value;arrayanSelected=null;arrayanPageRender();}});
function arrayanPageRender(){render();}

// Excel export keeps each receipt/allocation once, including documentary payments.
function collectionPaymentRows(exportAllStages=false){
 const out=[],posted=new Set((db.payments||[]).map(p=>p.id));
 const add=(p,refs,rid,clientId,type,amount,notes='')=>{if(collectionStage!=='all'&&rid!==collectionStage)return;const stages=[...new Set(refs.map(r=>String(r.stage||getLot(r.lotId)?.stage||'pending')))];if(!exportAllStages&&collectionStageFilter!=='all'&&!stages.includes(collectionStageFilter))return;const date=p.date||p.sourceRaw?.date||'',receivedMonth=/^\d{4}-(?:0[1-9]|1[0-2])-\d{2}$/.test(date)?date.slice(0,7):'',receiptPeriod=String(p.period||p.paymentMonth||'').match(/^(?:19|20)\d{2}-(?:0[1-9]|1[0-2])$/)?.[0]||String(p.concept||'').match(/\bMes\s+((?:19|20)\d{2}-(?:0[1-9]|1[0-2]))\b/i)?.[1]||'',linked=Boolean(clientId&&getClient(clientId)&&refs.length&&refs.every(r=>r.lotId&&getLot(r.lotId)));const status=receiptPeriod?'Cuota indicada en recibo · verificar contrato':linked?'Cliente y solar vinculados · mensualidad por verificar':'Revisar vinculación de solar/cliente';out.push([date,getClient(clientId)?.name||p.clientName||'',getClient(clientId)?.identity||'',residenceName(rid),stages.map(s=>s==='pending'?'Por confirmar':s).join(' / '),[...new Set(refs.map(r=>r.block))].join(' / '),refs.map(r=>String(r.solar||r.lot||'')).join(', '),type,amount,p.method||'',p.id||'',notes,receivedMonth,receiptPeriod,status]);};
 for(const p of db.historicalPayments||[]){if(p.postedPaymentId&&posted.has(p.postedPaymentId))continue;const s=(db.ownershipStatements||[]).find(s=>(s.paymentIds||[]).includes(p.id));add(p,p.references?.length?p.references:s?.references||[{stage:p.stage,block:p.block,lot:p.lot,lotId:p.lotId}],p.residenceId,p.clientId,p.type,p.amountCents==null?'':p.amountCents/100,(p.issues||[]).map(i=>lotigestLedger.historyIssueLabels[i]||i).join('; '));}
 for(const p of db.payments||[]){if(p.voidedAt)continue;const sale=db.sales.find(s=>s.id===p.saleId),lot=sale&&getLot(sale.lotId);if(!sale||!lot)continue;const historical=(db.historicalPayments||[]).find(h=>h.id===p.historicalImportId||h.postedPaymentId===p.id);const type=historical?.type||(/prima/i.test(p.concept||'')?'Prima':sale.type==='cash'?'Contado':'Abono');add(p,[{block:lot.block,solar:lot.sourceNumber||lot.number||lot.id,lotId:lot.id}],lot.residenceId,sale.clientId,type,p.amount,p.concept||'');}
 for(const p of db.ownerPayments||[]){if(p.voidedAt)continue;for(const a of p.allocations||[])add(p,a.references||[],p.residenceId,p.clientId,'Abono',a.amountCents/100,p.concept||'');}
 return out.sort((a,b)=>String(a[0]).localeCompare(String(b[0]))||a[1].localeCompare(b[1]));
}
function paymentExcelBytes(rows,headers=null,additionalSheets=[]){
 const xml=s=>String(s??'').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
 const paymentHeaders=['Fecha','Cliente','Identidad','Residencial','Etapa','Bloque','Solar(es)','Tipo de pago','Monto (L)','Método','Recibo / Referencia','Observaciones','Mes del pago (fecha)','Mensualidad del recibo','Estado de vinculación'];
 const sheets=[...additionalSheets,{name:'Primas y abonos',rows:[headers||paymentHeaders,...rows]}];
 const column=n=>{let out='';for(n++;n;n=Math.floor((n-1)/26))out=String.fromCharCode(65+(n-1)%26)+out;return out;};
 const buildSheet=grid=>'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="'+grid[0].length+'" width="24" customWidth="1"/></cols><sheetData>'+grid.map((row,i)=>'<row r="'+(i+1)+'">'+row.map((v,j)=>'<c r="'+column(j)+(i+1)+'" '+(typeof v==='number'&&Number.isFinite(v)?'t="n"><v>'+v+'</v>':'t="inlineStr"><is><t xml:space="preserve">'+xml(v)+'</t></is>')+'</c>').join('')+'</row>').join('')+'</sheetData><autoFilter ref="A1:'+column(grid[0].length-1)+grid.length+'"/></worksheet>';
 const files={
  '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+sheets.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>',
  '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  'xl/workbook.xml':'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+sheets.map((sheet,i)=>'<sheet name="'+xml(sheet.name)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets></workbook>',
  'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'</Relationships>'
 };
 for(let i=0;i<sheets.length;i++)files['xl/worksheets/sheet'+(i+1)+'.xml']=buildSheet(sheets[i].rows);
 const enc=new TextEncoder(),parts=[],central=[];let offset=0;
 const header=(size,values)=>{const a=new Uint8Array(size),v=new DataView(a.buffer);for(const [at,n,bytes] of values)bytes===2?v.setUint16(at,n,true):v.setUint32(at,n,true);return a;};
 for(const [path,content] of Object.entries(files)){
  const name=enc.encode(path),data=enc.encode(content);let crc=0xffffffff;
  for(const b of data){crc^=b;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  crc=(crc^0xffffffff)>>>0;
  const local=header(30,[[0,0x04034b50,4],[4,20,2],[14,crc,4],[18,data.length,4],[22,data.length,4],[26,name.length,2]]);
  parts.push(local,name,data);
  central.push(header(46,[[0,0x02014b50,4],[4,20,2],[6,20,2],[16,crc,4],[20,data.length,4],[24,data.length,4],[28,name.length,2],[42,offset,4]]),name);
  offset+=30+name.length+data.length;
 }
 const centralSize=central.reduce((n,a)=>n+a.length,0);
 parts.push(...central,header(22,[[0,0x06054b50,4],[8,files&&Object.keys(files).length,2],[10,Object.keys(files).length,2],[12,centralSize,4],[16,offset,4]]));
 const result=new Uint8Array(parts.reduce((n,a)=>n+a.length,0));let at=0;
 for(const a of parts){result.set(a,at);at+=a.length;}
 return result;
}
// Primera hoja del informe: cada cliente aparece aunque aún no tenga ningún pago.
// Una fila por solar referenciado. Nunca duplicar un pago por cada solar.
function collectionClientRows(){
 const rid=residence().id,customers=new Map(),propertyKeys=new Map();
 const getEntry=(clientId,sourceName='',sourceId='')=>{
  const person=clientId?getClient(clientId):null;
  const key=person?'client:'+person.id:'unlinked:'+sourceId;
  if(!key||key==='unlinked:')return null;
  if(!customers.has(key))customers.set(key,{id:person?.id||null,name:person?.name||sourceName||'Propietario por vincular',
   identity:person?.identity||'',phone:person?.phone||'',lots:new Map(),sources:new Set()});
  return customers.get(key);
 };
 const add=(clientId,raw,source,sourceName='',sourceId='')=>{
  const row=getEntry(clientId,sourceName,sourceId);if(!row)return;
  row.sources.add(source);
  if(!raw)return;
  const lot=raw.lotId?getLot(raw.lotId):null;
  if(lot&&lot.residenceId!==rid)return;
  const stage=String(raw.stage||lot?.stage||'Por confirmar');
  const block=String(raw.block||lot?.block||'Por confirmar');
  const solar=String(raw.solar||raw.lot||lot?.sourceNumber||lot?.number||lot?.id||'Por confirmar');
  const lotId=lot?.id||'';
  const key=[stage.trim().toUpperCase(),block.trim().toUpperCase(),solar.trim().replace(/^0+(?=\d)/,'')].join('|');
  const previous=row.lots.get(key);
  if(!previous||!previous.lotId)row.lots.set(key,{stage,block,solar,lotId,
   state:lot?.status||'Referencia en ficha',source});
 };
 // La lista db.clients ya está acotada a la residencial por withResidenceData.
 for(const c of db.clients||[])getEntry(c.id);
 for(const l of db.lots||[]){
  const owners=new Set([l.ownerClientId,...(db.sales||[]).filter(s=>s.lotId===l.id).map(s=>s.clientId)].filter(Boolean));
  for(const cid of owners)add(cid,{stage:l.stage,block:l.block,lot:l.sourceNumber||l.number||l.id,lotId:l.id},'Solar vinculado');
 }
 for(const statement of db.ownershipStatements||[]){
  const refs=statement.references?.length?statement.references:
   [{stage:null,block:statement.rawReference?.block,lot:statement.rawReference?.lot}];
  for(const ref of refs)add(statement.clientId,ref,'Ficha documental',statement.clientName,statement.id);
 }
 for(const contract of db.historicalContracts||[]){
  const refs=contract.references?.length?contract.references:[{stage:contract.stage,block:contract.block,lot:contract.lot}];
  for(const ref of refs)add(contract.clientId,ref,'Contrato histórico',contract.clientName,contract.id);
 }
 // Movimientos importados sin persona vinculada: no ocultar el nombre consignado en el Excel.
 for(const payment of db.historicalPayments||[]){
  if(payment.clientId&&getClient(payment.clientId))continue;
  const refs=payment.references?.length?payment.references:[{stage:payment.stage,block:payment.block,lot:payment.lot,lotId:payment.lotId}];
  for(const ref of refs)add(null,ref,'Movimiento por vincular',payment.clientName,payment.contractId||payment.id);
 }
 const rows=[];
 for(const row of customers.values()){
  const status=row.id&&typeof lotigestPrimaStatus==='function'?lotigestPrimaStatus(row.id,rid):
   {label:'Prima por verificar',agreedCents:null,paidCents:null,remainingCents:null};
  const refs=row.lots.size?[...row.lots.values()]:[{stage:'',block:'',solar:'',lotId:'',state:'Sin solar vinculado',source:'Cliente registrado'}];
  for(const ref of refs)rows.push([
   row.name,row.identity,row.phone,residenceName(rid),ref.stage,ref.block,ref.solar,ref.lotId,ref.state,
   status.label,status.agreedCents===null?'':status.agreedCents/100,
   status.paidCents===null?'':status.paidCents/100,
   status.remainingCents===null?'':status.remainingCents/100,
   [...row.sources].join(' · ')||ref.source,
   row.id?'':'Referencia documental: verificar asociación del cliente'
  ]);
 }
 return rows.sort((a,b)=>String(a[0]).localeCompare(String(b[0]),'es')||
  String(a[4]).localeCompare(String(b[4]))||String(a[5]).localeCompare(String(b[5]))||
  String(a[6]).localeCompare(String(b[6])));
}
function collectionExportWorkbook(){
 const payments=collectionPaymentRows(true),clients=collectionClientRows();
 const headers=['Cliente','Identidad','Teléfono','Residencial','Etapa','Bloque','Solar','Código del solar',
  'Estado solar','Estado de prima','Prima acordada (L)','Prima registrada (L)','Prima pendiente (L)','Origen','Observaciones'];
 return {payments,clients,headers};
}
const paymentExportCollectionPage=collectionPage;
collectionPage=function(){return paymentExportCollectionPage().replace(/(<button[^>]+data-action="debt-csv"[^>]*>)/,'<button class="btn btn-primary" data-action="payments-excel">Exportar Excel de primas y abonos</button>$1');};
const paymentExportHandler=handlerAction;
handlerAction=function(action,el){if(action!=='payments-excel')return paymentExportHandler(action,el);const rows=collectionPaymentRows();if(!rows.length){toast('No hay pagos para la residencial y etapa seleccionadas.');return;}download('LOTIGEST_Primas_Abonos_'+dateKey(new Date())+'.xlsx',paymentExcelBytes(rows),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');toast('Excel descargado · '+rows.length+' movimientos. Incluye todo el historial de la residencial y etapa seleccionadas.');};

// Residential workspace: filter views without replacing the complete saved database.
function residentialState(state,rid){
 const lots=state.lots.filter(l=>l.residenceId===rid),lotIds=new Set(lots.map(l=>l.id)),sales=state.sales.filter(s=>lotIds.has(s.lotId)),saleIds=new Set(sales.map(s=>s.id));
 const belongs=x=>x.residenceId===rid,linked=new Set([...sales,...lots.map(l=>({clientId:l.ownerClientId})),...(state.reservations||[]).filter(x=>belongs(x)||lotIds.has(x.lotId)),...(state.historicalContracts||[]).filter(belongs),...(state.historicalPayments||[]).filter(belongs),...(state.ownershipStatements||[]).filter(belongs)].map(x=>x.clientId).filter(Boolean));
 const hasAnyLink=id=>state.sales.some(s=>s.clientId===id)||state.lots.some(l=>l.ownerClientId===id)||['reservations','historicalContracts','historicalPayments','ownershipStatements'].some(k=>(state[k]||[]).some(x=>x.clientId===id));
 const fallback=state.residences.find(r=>!r.hidden)?.id;
 const clients=state.clients.filter(c=>linked.has(c.id)||c.residenceId===rid||(c.residenceIds||[]).includes(rid)||(!c.residenceId&&!c.residenceIds?.length&&!hasAnyLink(c.id)&&rid===fallback));
 const clientIds=new Set(clients.map(c=>c.id)),scoped={...state,lots,clients,sales,payments:state.payments.filter(p=>saleIds.has(p.saleId))};
 for(const k of ['historicalContracts','historicalPayments','ownershipStatements','ownerPayments','ledgerImportBatches','cashEntries'])if(state[k])scoped[k]=state[k].filter(belongs);
 if(state.reservations)scoped.reservations=state.reservations.filter(r=>belongs(r)||lotIds.has(r.lotId));
 if(state.contractTexts)scoped.contractTexts=state.contractTexts.filter(x=>clientIds.has(x.clientId)&&(!x.residenceId||belongs(x)));
 return scoped;
}
withResidenceData=function(fn){const original=db;try{db=residentialState(original,residence().id);return fn();}finally{db=original;}};
function residentialSettings(){return `<section class="card card-padding" data-residential-settings><h2>Mis residenciales</h2><p>Ingresa a una residencial para consultar y registrar únicamente sus datos.</p><button class="btn btn-primary" data-action="residence-new">+ Crear residencial</button><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;margin-top:16px">${db.residences.filter(r=>!r.hidden).map(r=>`<article class="card card-padding"><h3>${esc(r.name)}</h3><p>${esc(r.location||'Ubicación por completar')}</p><p>${db.lots.filter(l=>l.residenceId===r.id).length} solares${r.id===residence().id?' · Residencial activa':''}</p><button class="btn btn-primary" data-action="workspace-enter" data-id="${esc(r.id)}">Ingresar a esta residencial</button> <button class="btn btn-outline" data-action="residence-edit" data-id="${esc(r.id)}">Editar</button></article>`).join('')}</div></section>`;}
const residentialBaseSettings=settingsPage;
settingsPage=function(){return residentialSettings()+residentialBaseSettings();};
pageContent=function(){
 const rid=residence().id;collectionStage=rid;financeFilter.residenceId=rid;
 const badge=`<div class="notice-card" data-active-residential style="margin-bottom:16px">Residencial activa: <strong>${esc(residence().name)}</strong> <button class="btn btn-outline btn-sm" data-page="settings">Cambiar residencial</button></div>`;
 const globalPages=['settings','residences','users','backup','help','design'];
 if(globalPages.includes(page))return badge+basePageContent();
 return badge+(['gps','arrayan'].includes(page)?'':residencePicker())+withResidenceData(()=>page==='pending'?clientPendingPage():basePageContent());
};
const residentialBaseSwitch=setResidence;
setResidence=function(id){if(!db.residences.some(r=>r.id===id&&!r.hidden))return;closeModal();collectionStage=id;collectionStageFilter='all';collectionFilter='all';financeFilter.residenceId=id;paymentDraft=null;ownerPaymentDraft=null;return residentialBaseSwitch(id);};
const residentialAction=handlerAction;
handlerAction=function(action,el){
 if(action==='workspace-enter'){page='dashboard';setResidence(el.dataset.id);return;}
 if(['debt-csv','debt-print','payments-excel','finance-csv','finance-print'].includes(action))return withResidenceData(()=>residentialAction(action,el));
 if(action==='residence-open'){page='arrayan';setResidence(el.dataset.id);return;}
 return residentialAction(action,el);
};
const residentialForm=doForm;
doForm=function(form){
 if(form.dataset.form!=='client')return residentialForm(form);
 const data=Object.fromEntries(new FormData(form)),name=String(data.name||'').trim(),rid=residence().id;
 if(!name){toast('El nombre es obligatorio.','error');return;}
 const next=JSON.parse(JSON.stringify(db)),oldId=String(data.oldId||''),client=oldId?next.clients.find(c=>c.id===oldId):null;
 if(oldId&&(!client||!residentialState(db,rid).clients.some(c=>c.id===oldId))){toast('El cliente no pertenece a esta residencial.','error');return;}
 const fields={name,identity:String(data.identity||'').trim(),phone:String(data.phone||'').trim(),email:String(data.email||'').trim(),address:String(data.address||'').trim()};
 if(client)Object.assign(client,fields);else next.clients.unshift({id:uid('C'),residenceId:rid,...fields});
 try{cloudWrite(JSON.stringify(next));}catch(e){toast('No se pudo guardar el cliente.','error');return;}
 db=next;closeModal();page='clients';filter='';render();toast('Cliente guardado en '+residence().name);
};
// These functions only read state or render controls; writes always use the full state.
const residentialClientView=viewClient;viewClient=function(id){return withResidenceData(()=>residentialClientView(id));};
const residentialSaleForm=newSale;newSale=function(){return withResidenceData(()=>residentialSaleForm());};
const residentialSolarSearch=searchSolarClients;searchSolarClients=function(...args){return withResidenceData(()=>residentialSolarSearch(...args));};
const residentialContractSearch=renderContractClientResults;renderContractClientResults=function(){return withResidenceData(()=>residentialContractSearch());};
const residentialFinanceReport=financeReport;financeReport=function(f=financeFilter){financeFilter.residenceId=residence().id;return withResidenceData(()=>residentialFinanceReport({...f,residenceId:residence().id}));};
const residentialLedgers=ledgers;ledgers=function(...args){return withResidenceData(()=>residentialLedgers(...args));};
const residentialFinanceForm=financeEntryForm;financeEntryForm=function(kind,id=null){residentialFinanceForm(kind,id,residence().id);const select=document.querySelector('#finance-entry-form [name="residenceId"]');if(select){for(const o of [...select.options])if(o.value!==residence().id)o.remove();select.value=residence().id;}};
const residentialRender=render;render=function(){residentialRender();for(const selector of ['#debt-residence','[data-finance-filter="residenceId"]']){const select=document.querySelector(selector);if(select){for(const o of [...select.options])if(o.value!==residence().id)o.remove();select.value=residence().id;}}};

let excelDownloadUrl=null;
function downloadExcel(name,headers,rows,additionalSheets=[]){
 try{
  const bytes=paymentExcelBytes(rows,headers,additionalSheets),mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',blob=new Blob([bytes],{type:mime});
  if(excelDownloadUrl)URL.revokeObjectURL?.(excelDownloadUrl);
  document.querySelector('#excel-download-ready')?.remove();excelDownloadUrl=URL.createObjectURL(blob);
  const box=document.createElement('aside');box.id='excel-download-ready';box.setAttribute('role','status');box.style.cssText='position:fixed;bottom:16px;left:16px;right:16px;max-width:560px;z-index:25000;background:white;color:#164532;border:2px solid #164532;border-radius:12px;padding:16px;box-shadow:0 4px 24px #0004';
  const message=document.createElement('p');const extra=additionalSheets.reduce((n,s)=>n+Math.max(0,s.rows.length-1),0);message.textContent=additionalSheets.length?'Excel listo: '+extra+' filas de clientes/solares y '+rows.length+' movimientos de primas y abonos.':rows.length?'Excel listo: '+rows.length+' filas.':'Excel listo con los encabezados de la plantilla. No hay registros para exportar.';box.append(message);
  const link=document.createElement('a');link.href=excelDownloadUrl;link.download=name;link.textContent='Descargar '+name;link.className='btn btn-primary';box.append(link);
  if(typeof File!=='undefined'&&navigator.canShare){const file=new File([bytes],name,{type:mime});if(navigator.canShare({files:[file]})){const share=document.createElement('button');share.textContent='Guardar o compartir';share.className='btn btn-outline';share.onclick=async()=>{try{await navigator.share({files:[file],title:name});}catch(e){if(e.name!=='AbortError')toast('Utiliza el enlace Descargar Excel.','error');}};box.append(share);}}
  const close=document.createElement('button');close.textContent='Cerrar';close.className='btn btn-soft';close.onclick=()=>box.remove();box.append(close);document.body.append(box);link.click();
 }catch(error){toast('No se pudo generar el Excel: '+(error.message||'intenta nuevamente.'),'error');}
}
lotMeasuresTemplate=function(){const rows=residenceLots().map(l=>[l.id,l.block,String(l.sourceNumber||l.id),l.type==='commercial'?'Local':'Solar',l.area??'',l.price??'',l.dimensions?.front??'',l.dimensions?.depth??'',l.dimensions?.left??'',l.dimensions?.right??'']);downloadExcel('Plantilla_medidas_precios.xlsx',lotImportColumns,rows);};
buyerImportTemplate=function(){const rows=residenceLots().filter(l=>l.status==='sold'&&!db.sales.some(s=>s.lotId===l.id)).map(l=>[l.id,l.block,String(l.sourceNumber||l.id),inventoryKind(l),'','','','','',l.price||'',0,'',0,'','']);downloadExcel('Plantilla_compradores.xlsx',buyerColumns,rows);};
function ledgerExcelTemplate(){downloadExcel('Plantilla_primas_abonos.xlsx',['CLIENTE','ETAPA','BLOQUE','SOLARES','FECHA DE PAGO','MONTO (L)','TIPO DE PAGO','ESTADO','ID CONTRATO'],[]);}
const excelLedgerImport=openLedgerImport;openLedgerImport=function(){excelLedgerImport();const content=document.querySelector('#modal-root .modal-content');if(content)content.insertAdjacentHTML('afterbegin','<p><button class="btn btn-outline" data-action="ledger-excel-template">Descargar plantilla Excel (.xlsx)</button></p><p>Una fila por cliente, etapa y bloque. En SOLARES escribe cada número separado por comas: 3, 5, 7. Para otra etapa o bloque, repite el nombre del cliente en una fila nueva. El monto de cada fila se conserva una sola vez; no lo repitas para distribuir un mismo pago.</p>');};
const excelCollectionPage=collectionPage;collectionPage=function(){return excelCollectionPage().replace('Descargar reporte CSV','Exportar reporte Excel').replace('Exportar Excel de primas y abonos</button>','Exportar Excel de primas y abonos</button><button class="btn btn-outline" data-action="ledger-excel-template">Plantilla Excel de pagos</button>');};
const excelLotsPage=lotsPage;lotsPage=function(){return excelLotsPage().replace('Importar medidas y precios</button>','Importar medidas y precios</button><button class="btn btn-outline" data-action="inventory-excel">Exportar terrenos Excel</button><button class="btn btn-outline" data-action="lot-measures-template">Plantilla Excel de terrenos</button>');};
const excelDebtReport=debtReport;debtReport=function(print=false){if(print)return excelDebtReport(true);return withResidenceData(()=>{const headers=['Residencial','Etapa','Bloque','Solar','Estado','Cliente','Teléfono','Mes','Pendiente del mes (L)','Total vencido (L)','Cuotas vencidas','Meses vencidos','Primer vencimiento','Saldo del crédito (L)'],rows=collectionList().map(x=>[residenceName(x.lot.residenceId),x.lot.stage||'',x.lot.block,String(x.lot.sourceNumber||x.lot.id),overdueLabel(x),x.client?.name||'',x.client?.phone||'',collectionMonth,x.monthAmount,x.lateAmount,x.overdue.length,x.overdueMonths,x.oldest||'',x.sale?balance(x.sale):0]);downloadExcel('Reporte_solares_'+collectionMonth+'.xlsx',headers,rows);});};
const excelActions=handlerAction;handlerAction=function(action,el){
 if(action==='ledger-excel-template'){ledgerExcelTemplate();return;}
 if(action==='payments-excel'){return withResidenceData(()=>{const report=collectionExportWorkbook();if(!report.clients.length&&!report.payments.length){toast('No hay clientes ni pagos vinculados a esta residencial. Revisa la residencial activa.','error');return;}downloadExcel('LOTIGEST_Primas_Abonos_'+dateKey(new Date())+'.xlsx',null,report.payments,[{name:'Clientes y solares',rows:[report.headers,...report.clients]}]);});}
 if(action==='inventory-excel'){return withResidenceData(()=>downloadExcel('Terrenos_'+dateKey(new Date())+'.xlsx',['Código','Residencial','Etapa','Bloque','Solar','Tipo','Área (m²)','Precio (L)','Estado'],db.lots.map(l=>[l.id,residenceName(l.residenceId),l.stage||'',l.block,String(l.sourceNumber||l.id),inventoryKind(l),l.area??'',l.price??'',l.status])));}
 return excelActions(action,el);
};
