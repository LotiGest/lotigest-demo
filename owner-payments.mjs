// Abonos nuevos de propietarios. El historial importado nunca se convierte en ingresos nuevos.
const ownerClone=value=>JSON.parse(JSON.stringify(value));
const ownerToday=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Tegucigalpa'}).format(new Date());
function ownerCents(value){const n=Number(value),c=Math.round(n*100);if(value===''||value==null||!Number.isSafeInteger(c)||c<=0||Math.abs(n*100-c)>.00001)throw Error('Escribe un monto positivo con hasta dos decimales.');return c;}
function ownerDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('Fecha de abono inválida.');const d=new Date(value+'T12:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==value||value>ownerToday())throw Error('La fecha debe ser válida y no futura.');return value;}
export function ownerStatementBalance(state,statement){const rows=statement.documentedBalances||[],last=rows.length?rows[rows.length-1]:null;const initial=last?last.amountCents:statement.documentedOpeningBalanceCents;if(!Number.isSafeInteger(initial)||initial<0)return null;const paid=(state.ownerPayments||[]).reduce((n,p)=>n+p.allocations.filter(a=>a.statementId===statement.id).reduce((x,a)=>x+a.amountCents,0),0);return initial-paid;}
export function ownerAllocationReferences(state,statement,index){const refs=index==null?statement.references:[statement.references[index]];if(!refs?.length||refs.some(r=>!r))throw Error('Confirma primero el bloque y solar de esta ficha.');return refs.map(r=>{const l=r.lotId?state.lots.find(l=>l.id===r.lotId):null,block=String(r.block||l?.block||''),solar=String(r.lot||l?.sourceNumber||'');if(!block||!solar)throw Error('Confirma primero el bloque y solar de esta ficha.');return {stage:r.stage||l?.stage||null,block,solar,lotId:r.lotId||null,mapAssignmentPending:!r.lotId};});}

// Correlativo numérico del recibo físico: el texto visible conserva los ceros,
// pero los duplicados se comparan sin ceros iniciales, sin convertir a Number.
export function normalizeReceiptCorrelativo(raw){
 const value=String(raw??'').trim();
 return /^\d+$/.test(value)?value.replace(/^0+(?=\d)/,''):null;
}
export function requireReceiptCorrelativo(raw){
 const value=String(raw??'').trim();
 if(!value)throw Error('Debes ingresar el correlativo del pago.');
 if(value.length>80||!/^[0-9]+$/.test(value))throw Error('El correlativo de pago debe contener solamente números (hasta 80 dígitos).');
 return normalizeReceiptCorrelativo(value);
}
export function findReceiptCorrelativo(state,raw){
 const key=normalizeReceiptCorrelativo(raw);if(key===null)return null;
 for(const p of state.payments||[])if(normalizeReceiptCorrelativo(p.receiptReference||p.receiptReferenceNormalized)===key)return {normalized:key,kind:'venta',id:p.id};
 for(const p of state.ownerPayments||[])if(normalizeReceiptCorrelativo(p.receiptReference||p.receiptReferenceNormalized||p.originalReceiptRef)===key)return {normalized:key,kind:'propietario',id:p.id};
 for(const p of state.historicalPayments||[])if(normalizeReceiptCorrelativo(p.receiptReference||p.receiptReferenceNormalized||p.sourceRaw?.receiptRef||p.sourceRaw?.folio)===key)return {normalized:key,kind:'histórico',id:p.id};
 return null;
}
// Solo valida los recibos NUEVOS para no alterar legados sin correlativo.
// Los pagos de una misma operación (varios solares) comparten un único correlativo.
export function validateNewReceiptCorrelativos(previous,next){
 const oldSales=new Set((previous.payments||[]).map(x=>x.id));
 const oldOwners=new Set((previous.ownerPayments||[]).map(x=>x.id));
 const fresh=[];
 for(const p of next.payments||[])if(!oldSales.has(p.id)&&p.groupId&&!p.historicalImportId)
  fresh.push({raw:p.receiptReference,normalized:p.receiptReferenceNormalized,group:'venta:'+p.groupId});
 for(const p of next.ownerPayments||[])if(!oldOwners.has(p.id))
  fresh.push({raw:p.receiptReference,normalized:p.receiptReferenceNormalized,group:'propietario:'+p.id});
 const seen=new Map();
 for(const p of fresh){
  const key=requireReceiptCorrelativo(p.raw);
  if(p.normalized!=null&&p.normalized!==key)throw Error('El correlativo normalizado del pago no coincide con el recibo.');
  if(findReceiptCorrelativo(previous,p.raw))throw Error('El correlativo '+key+' ya está registrado en otro pago. No se guardaron cambios.');
  const prior=seen.get(key);
  if(prior&&prior!==p.group)throw Error('El correlativo '+key+' aparece en dos pagos distintos. No se guardaron cambios.');
  seen.set(key,p.group);
 }
}
export function createOwnerPayment(input,draft){
 const state=ownerClone(input);state.ownerPayments??=[];if(!/^OP-[a-f0-9-]{36}$/.test(draft.id||''))throw Error('Referencia de recibo inválida.');if(!draft.reviewed)throw Error('Confirma el cliente, los solares y los montos antes de guardar.');
 const date=ownerDate(draft.date),client=state.clients.find(c=>c.id===draft.clientId);if(!client||!state.residences?.some(r=>r.id===draft.residenceId))throw Error('Selecciona un propietario y una residencial válidos.');if(!Array.isArray(draft.allocations)||!draft.allocations.length||draft.allocations.length>30)throw Error('Selecciona entre 1 y 30 solares o grupos.');
 const concept=String(draft.concept||'Abono').trim().slice(0,300),method=String(draft.method||'').trim().slice(0,80),receiptReference=String(draft.receiptRef||'').trim(),receiptReferenceNormalized=requireReceiptCorrelativo(receiptReference);if(!concept||!method)throw Error('Indica concepto y método de pago.');
 const request={clientId:client.id,residenceId:draft.residenceId,date,method,concept,receiptReference,receiptReferenceNormalized,allocations:draft.allocations.map(a=>({statementId:a.statementId,referenceIndex:a.referenceIndex==null?null:Number(a.referenceIndex),amountCents:ownerCents(a.amount)}))};
 const prior=state.ownerPayments.find(p=>p.id===draft.id);if(prior){if(JSON.stringify(prior.request)!==JSON.stringify(request))throw Error('Ese recibo ya existe con otros datos.');return {state,receipt:prior};}
 const matching=findReceiptCorrelativo(state,receiptReference);
 if(matching)throw Error('El correlativo '+receiptReferenceNormalized+' ya está registrado en otro pago.');
 const groups=new Map(),usedReferences=new Set(),allocations=request.allocations.map(a=>{const s=state.ownershipStatements?.find(s=>s.id===a.statementId);if(!s||s.clientId!==client.id||s.residenceId!==draft.residenceId)throw Error('Todos los solares deben pertenecer a la misma persona y residencial.');if((s.contractIds||[]).some(id=>state.historicalContracts?.find(c=>c.id===id)?.saleId))throw Error('Esta ficha ya tiene una venta con cuotas. Registra el abono desde sus ventas.');if(a.referenceIndex!=null&&(!Number.isInteger(a.referenceIndex)||a.referenceIndex<0))throw Error('Solar inválido.');const refs=ownerAllocationReferences(state,s,a.referenceIndex);for(const r of refs){const key=r.lotId||r.block+':'+r.solar;if(usedReferences.has(key))throw Error('El mismo solar aparece en más de una ficha seleccionada. Confirma una sola ficha antes de abonar.');usedReferences.add(key);const l=r.lotId&&state.lots.find(l=>l.id===r.lotId);if(l?.ownerClientId&&l.ownerClientId!==client.id||l&&state.sales.some(v=>v.lotId===l.id&&v.clientId!==client.id))throw Error('El terreno tiene otro propietario.');}if(!groups.has(s.id))groups.set(s.id,{indexes:new Set(),total:0,statement:s});const g=groups.get(s.id),key=a.referenceIndex==null?'group':a.referenceIndex;if(g.indexes.has(key)||g.indexes.has('group')||key==='group'&&g.indexes.size)throw Error('No mezcles el abono conjunto con los mismos solares individuales.');g.indexes.add(key);g.total+=a.amountCents;return {...a,references:refs,sourceName:s.sourceName};});
 for(const g of groups.values()){const left=ownerStatementBalance(state,g.statement);if(left!=null&&g.total>left)throw Error('El abono supera el saldo documentado disponible de la ficha. Revisa sus condiciones antes de continuar.');}
 const amountCents=allocations.reduce((n,a)=>n+a.amountCents,0);if(!Number.isSafeInteger(amountCents))throw Error('El total supera el límite permitido.');
 const receipt={id:draft.id,clientId:client.id,clientName:client.name,residenceId:draft.residenceId,residenceName:state.residences.find(r=>r.id===draft.residenceId).name||'',date,method,concept,receiptReference,receiptReferenceNormalized,amountCents,allocations,request,recordedAt:new Date().toISOString(),balanceMode:'documentary-no-installment-schedule'};
 state.ownerPayments.unshift(receipt);return {state,receipt};
}
export function validateOwnerPayments(state){
 if(state.ownerPayments!==undefined&&!Array.isArray(state.ownerPayments))throw Error('Colección de abonos incompatible.');const ids=new Set(),references=new Set(),statementTotals=new Map();for(const p of state.ownerPayments||[]){if(p.receiptReference){if(typeof p.receiptReference!=='string'||p.receiptReference.length>80)throw Error('Número de recibo incompatible.');const key=p.residenceId+':'+p.receiptReference.trim().toUpperCase();if(references.has(key))throw Error('Número de recibo duplicado en la residencial.');references.add(key);}if(!p||!/^OP-[a-f0-9-]{36}$/.test(p.id||'')||ids.has(p.id))throw Error('Recibo de propietario duplicado o inválido.');ids.add(p.id);ownerDate(p.date);if(!state.clients.some(c=>c.id===p.clientId)||!state.residences.some(r=>r.id===p.residenceId))throw Error('Recibo sin cliente o residencial válidos.');if(!Number.isSafeInteger(p.amountCents)||p.amountCents<=0||!Array.isArray(p.allocations)||!p.allocations.length||p.allocations.length>30)throw Error('Monto o distribución del abono inválidos.');let sum=0;const seen=new Map(),usedReferences=new Set();for(const a of p.allocations){const s=state.ownershipStatements?.find(s=>s.id===a.statementId);if(!s||s.clientId!==p.clientId||s.residenceId!==p.residenceId||!Number.isSafeInteger(a.amountCents)||a.amountCents<=0)throw Error('El abono no corresponde al propietario de la ficha.');if((s.contractIds||[]).some(id=>state.historicalContracts?.find(c=>c.id===id)?.saleId))throw Error('La ficha con abonos de propietario no puede convertirse sin conciliar los recibos posteriores.');const key=a.referenceIndex==null?'group':a.referenceIndex;if(key!=='group'&&(!Number.isInteger(key)||key<0))throw Error('Referencia de solar inválida.');const refs=ownerAllocationReferences(state,s,a.referenceIndex);for(const r of refs){const lot=r.lotId&&state.lots.find(l=>l.id===r.lotId);if(lot?.ownerClientId&&lot.ownerClientId!==p.clientId)throw Error('El abono no coincide con el propietario del solar.');const key=r.lotId||r.block+':'+r.solar;if(usedReferences.has(key))throw Error('Un mismo solar se distribuyó dos veces.');usedReferences.add(key);}if(JSON.stringify(refs.map(r=>[r.block,r.solar]))!==JSON.stringify((a.references||[]).map(r=>[r.block,r.solar])))throw Error('El recibo no coincide con los solares de su ficha.');if(!seen.has(s.id))seen.set(s.id,new Set());const indexes=seen.get(s.id);if(indexes.has(key)||indexes.has('group')||key==='group'&&indexes.size)throw Error('Distribución duplicada dentro del recibo.');indexes.add(key);sum+=a.amountCents;statementTotals.set(s.id,(statementTotals.get(s.id)||0)+a.amountCents);}if(sum!==p.amountCents)throw Error('La distribución no coincide con el total recibido.');}
 for(const [id,total] of statementTotals){const s=state.ownershipStatements.find(s=>s.id===id),last=s.documentedBalances?.at(-1),base=last?last.amountCents:s.documentedOpeningBalanceCents;if(Number.isSafeInteger(base)&&total>base)throw Error('Los abonos superan el saldo documentado de la ficha.');}
}
