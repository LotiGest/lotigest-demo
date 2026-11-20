// Historial modal de abonos por fecha. Solo lee datos reales; no modifica la contabilidad.
let pmHistoryLayer=null;
function pmHistoryRows(){
 const out=[];
 if(pmActive==='sale'){
  const sales=pmSales(),byId=new Map(sales.map(s=>[s.id,s]));
  const groups=new Map();
  for(const p of db.payments||[]){
   if(!byId.has(p.saleId)||p.voidedAt||p.deletedAt)continue;
   const key=String(p.groupId||p.id);
   if(!groups.has(key))groups.set(key,{id:key,date:p.date||'',amountCents:0,parts:[],lots:new Set(),
    method:p.method||'',concept:p.concept||'',receiptId:p.id,action:'receipt-preview',kind:'Recibo registrado'});
   const entry=groups.get(key),sale=byId.get(p.saleId),lot=getLot(sale.lotId);
   entry.amountCents+=Math.round(Number(p.amount||0)*100);
   if(lot)entry.lots.add('Etapa '+(lot.stage||'—')+' · Bloque '+(lot.block||'—')+' · Solar '+(lot.sourceNumber||lot.id));
   const allocations=p.receiptInfo?.allocations;
   if(Array.isArray(allocations)&&allocations.length){
    for(const a of allocations){
     const period=String(a.month||'');
     const advance=Boolean(period&&p.date&&p.date.slice(0,7)<period);
     const text=a.number?'Cuota '+a.number+(period?' ('+period+')':'')+(advance?' · adelantada':''):
      String(a.label||'Prima / pago inicial');
     entry.parts.push(text+' · '+money(Number(a.amount||0)));
    }
   }else entry.parts.push('Aplicación mensual no identificada · verificar recibo');
  }
  out.push(...groups.values());
 }else if(pmActive==='owner'){
  const clientId=ownerPaymentDraft?.clientId,rid=ownerPaymentDraft?.residenceId;
  if(!clientId||!rid)return [];
  for(const p of db.ownerPayments||[]){
   if(p.clientId!==clientId||p.residenceId!==rid||p.voidedAt||p.deletedAt)continue;
   const lots=new Set();
   for(const a of p.allocations||[])for(const ref of a.references||[])
    lots.add('Etapa '+(ref.stage||'—')+' · Bloque '+(ref.block||'—')+' · Solar '+(ref.solar||ref.lot||'—'));
   out.push({id:p.id,date:p.date||'',amountCents:Number(p.amountCents||0),method:p.method||'',concept:p.concept||'',
    kind:/\bprima\b/i.test(String(p.concept||''))?'Prima registrada':'Abono en ficha',
    parts:[String(p.concept||'')||'Abono del propietario; consultar asignación'],
    lots,receiptId:p.id,action:'owner-payment-receipt'});
  }
  // Historial importado sin recibo publicado: conservarlo visible pero no sumarlo dos veces.
  for(const p of db.historicalPayments||[]){
   if(p.clientId!==clientId||p.residenceId!==rid||p.postedPaymentId||p.voidedAt||p.deletedAt)continue;
   out.push({id:p.id,date:p.date||'',amountCents:p.amountCents==null?null:Number(p.amountCents),
    method:p.method||'',concept:p.concept||'',kind:'Historial importado por revisar',
    parts:['Movimiento documental: no confirma cuota mensual hasta su conciliación'],
    lots:new Set([('Bloque '+(p.block||'—')+' · Solar '+(p.lot||p.solar||'—'))]),
    action:null,receiptId:null});
  }
 }
 return out.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(b.id).localeCompare(String(a.id)));
}
function pmClosePaymentHistory(){
 if(pmHistoryLayer){pmHistoryLayer.remove();pmHistoryLayer=null;}
}
function pmOpenPaymentHistory(){
 const rows=pmHistoryRows();
 pmClosePaymentHistory();
 const layer=pmNode('div','pm-history-layer'),shade=pmNode('div','pm-history-shade');
 const dialog=pmNode('section','pm-history-window');
 dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
 dialog.setAttribute('aria-labelledby','pm-history-title');
 const header=pmNode('div','pm-history-head');
 const heading=pmNode('div'),title=pmNode('h2','','Historial de pagos por fecha');
 title.id='pm-history-title';
 heading.append(title,pmNode('p','pm-help','Recibos ordenados del más reciente al más antiguo. Cada fecha muestra el pago recibido, el solar y las cuotas aplicadas.'));
 const close=pmNode('button','btn btn-soft pm-history-close','Cerrar ×');
 close.type='button';close.dataset.pmHistoryClose='true';
 header.append(heading,close);
 const filters=pmNode('div','pm-history-filters');
 const start=pmNode('label','','Desde'),from=pmNode('input');
 from.type='date';from.id='pm-history-from';start.append(from);
 const end=pmNode('label','','Hasta'),to=pmNode('input');
 to.type='date';to.id='pm-history-to';end.append(to);
 const clear=pmNode('button','btn btn-outline btn-sm','Todas las fechas');clear.type='button';
 const search=pmNode('label','','Filtrar concepto / recibo'),text=pmNode('input');
 text.type='search';text.placeholder='Número de recibo, cuota o solar';search.append(text);
 filters.append(start,end,search,clear);
 const count=pmNode('p','pm-history-count');
 const list=pmNode('div','pm-history-list');
 const render=()=>{
  list.replaceChildren();
  const q=String(text.value||'').trim().toLowerCase();
  const visible=rows.filter(p=>(!from.value||p.date>=from.value)&&(!to.value||p.date<=to.value)&&
    (!q||[p.id,p.concept,p.kind,...(p.parts||[]),...(p.lots||[])].join(' ').toLowerCase().includes(q)));
  count.textContent=visible.length+' registro(s) por fecha'+(visible.length?' · Último movimiento: '+(visible[0].date||'Por verificar'):'');
  if(!visible.length){list.append(pmNode('p','pm-help','No hay movimientos para estas fechas o el cliente/solar seleccionado.'));return;}
  for(const p of visible){
   const item=pmNode('article','pm-history-item');
   const row=pmNode('div','pm-history-item-head');
   row.append(pmNode('strong','',p.date||'Fecha por verificar'),pmNode('strong','',p.amountCents===null?'Importe por verificar':money(p.amountCents/100)));
   item.append(row,pmNode('span','pm-history-tag',p.kind+' · '+p.id));
   const body=pmNode('div','pm-history-item-body');
   body.append(pmNode('p','',p.method?'Método: '+p.method:'Método no indicado'));
   if(p.concept)body.append(pmNode('p','',p.concept));
   if(p.lots?.size)body.append(pmNode('p','','Solar(es): '+[...p.lots].join(' | ')));
   if(p.parts?.length)body.append(pmNode('p','','Aplicación: '+p.parts.join(' | ')));
   item.append(body);
   if(p.action&&p.receiptId){
    const button=pmNode('button','btn btn-outline btn-sm','Ver / imprimir recibo');
    button.type='button';button.dataset.action=p.action;button.dataset.id=p.receiptId;
    item.append(button);
   }else item.append(pmNode('small','pm-help','Documento sin recibo PDF vinculado; revisar el movimiento.'));
   list.append(item);
  }
 };
 from.addEventListener('change',render);to.addEventListener('change',render);
 text.addEventListener('input',render);
 clear.addEventListener('click',()=>{from.value='';to.value='';text.value='';render();});
 layer.append(shade,dialog);dialog.append(header,filters,count,list);
 layer.addEventListener('click',e=>{
  if(e.target===shade||e.target.closest('[data-pm-history-close]')){pmClosePaymentHistory();return;}
  if(e.target.closest('[data-action="receipt-preview"],[data-action="owner-payment-receipt"]'))
   pmClosePaymentHistory(); // deja que el manejador de recibos del programa abra el PDF
 });
 layer.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();pmClosePaymentHistory();}});
 document.body.append(layer);pmHistoryLayer=layer;render();close.focus();
}
