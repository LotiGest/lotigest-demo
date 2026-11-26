// Reorganiza controles existentes solo en PC. No modifica cálculos ni guardado.
(()=>{
 const desktop=matchMedia('(min-width:901px)');
 const moved=new Map();
 function restore(){
  for(const [node,anchor] of moved){if(anchor.isConnected){anchor.replaceWith(node);}else anchor.remove();}
  moved.clear();
 }
 function move(node,target){
  if(!node||!target||moved.has(node))return;
  const anchor=document.createComment('posición móvil');node.before(anchor);moved.set(node,anchor);target.append(node);
 }
 function decorate(){
  const modal=document.querySelector('#modal-root .pm-reference-payment');
  if(!modal||!desktop.matches||page!=='payments'){restore();return;}
  for(const [node,anchor] of moved)if(!anchor.isConnected){moved.delete(node);}
  const form=modal.querySelector('#multi-payment-form');if(!form)return;
  const sales=pmSales(),client=sales.length?getClient(sales[0].clientId):null;
  let toolbar=modal.querySelector('.pd-toolbar');
  if(!toolbar){
   toolbar=pmNode('nav','pd-toolbar');toolbar.setAttribute('aria-label','Documentos del abono');
   for(const [label,action] of [['Historial de pagos','history'],['Estado de cuenta','statement'],['Imprimir recibo','receipt'],['Enviar por WhatsApp','share']]){
    const b=pmNode('button','btn btn-outline',label);b.type='button';b.dataset.pdAction=action;
    b.addEventListener('click',()=>{
     if(action==='history')pmOpenPaymentHistory();
     else if(action==='statement'||action==='share')pmOpenStatement(b);
     else{
      const ids=new Set(pmSales().map(s=>s.id));
      const last=(db.payments||[]).filter(p=>ids.has(p.saleId)&&!p.voidedAt&&!p.deletedAt&&!p.cancelledAt&&!['voided','cancelled','annulled'].includes(p.status)).sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.recordedAt||'').localeCompare(String(a.recordedAt||'')))[0];
      if(last)paymentReceiptPreview(last.id);else toast('Este contrato todavía no tiene recibos registrados.');
     }
    });
    toolbar.append(b);
   }
   modal.querySelector('.modal-header')?.append(toolbar);
  }
  toolbar.querySelectorAll('button').forEach(b=>b.disabled=!sales.length);
  let info=modal.querySelector('.pd-client-info');
  if(!info){info=pmNode('div','pd-client-info');modal.querySelector('.pm-reference-client .pm-card-body')?.append(info);}
  info.replaceChildren();
  const docs=(db.contractTexts||[]).filter(d=>d.status!=='voided'&&sales.some(s=>d.saleId===s.id||d.id===s.documentId));
  for(const [label,value] of [['Cliente',client?.name||'Selecciona un cliente'],['Identidad',client?.identity||'—'],['Contrato',docs.map(d=>d.number||d.id).join(' / ')||sales.map(s=>s.id).join(' / ')||'—'],['Residencial',sales.length?residence().name:'—'],['Solares',sales.map(s=>{const l=getLot(s.lotId);return l?'Etapa '+(l.stage||'—')+' · '+(l.block||'—')+'-'+(l.sourceNumber||l.id):s.lotId;}).join(' / ')||'—']])info.append(pmSummaryRow(label,value));
  const fields=modal.querySelector('.pm-reference-entry .pm-fields'),options=fields?.querySelector('.pm-payment-options');
  const conceptInput=options?.querySelector('[name="concept"]');
  const concept=conceptInput?.closest('.field-group')||conceptInput?.closest('label');
  move(concept,fields);
  let clear=modal.querySelector('[data-pd-clear]');
  if(!clear){
   clear=pmNode('button','btn btn-outline pd-clear','Limpiar');clear.type='button';clear.dataset.pdClear='true';
   clear.addEventListener('click',()=>{
    for(const input of form.querySelectorAll('[data-payment-amount],#pm-client-total,.pm-currency-visible,[name="receiptRef"],[name="concept"]')){input.value=input.name==='concept'?input.defaultValue:'';input.dispatchEvent(new Event('input',{bubbles:true}));}
    const error=form.querySelector('#multi-payment-error');if(error)error.textContent='';
    form.querySelector('#pm-amount-slot input:not([type="hidden"])')?.focus();
   });
   modal.querySelector('.pm-reference-actions')?.append(clear);
  }
  const calendar=modal.querySelector('#pm-calendar-body');
  if(calendar){
   let fold=calendar.querySelector('.pd-calendar-detail');
   if(!fold){fold=pmFold('Ver detalle de conciliación');fold.classList.add('pd-calendar-detail');calendar.append(fold);}
   move(calendar.querySelector(':scope > .pm-progress'),fold);
   move(calendar.querySelector(':scope > .pm-current-date'),fold);
   const rows=pmActualSchedule(sales);
   for(const month of calendar.querySelectorAll('[data-pm-month]')){
    let amount=month.querySelector('.pd-month-amount');if(!amount){amount=pmNode('small','pd-month-amount');month.append(amount);}
    const scheduled=rows.filter(r=>r.dueDate.slice(0,7)===month.dataset.pmMonth);
    amount.textContent=scheduled.length?money(scheduled.reduce((n,r)=>n+r.dueCents,0)/100):'—';
   }
  }
 }
 const refresh=pmReferenceRefresh;
 pmReferenceRefresh=function(...args){const result=refresh(...args);decorate();return result;};
 // Los cambios de año reconstruyen el calendario, pero no el formulario.
 document.addEventListener('click',e=>{if(e.target.closest('[data-pm-year],[data-pm-month]'))decorate();});
 desktop.addEventListener('change',decorate);
})();
