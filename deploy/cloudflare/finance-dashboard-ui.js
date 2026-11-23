// Finanzas y utilidad: panel, gráfica compartida y libro diario mensual.
(function installFinanceDashboard(){
 let query='',kind='all';
 const originalMovements=financeMovements;
 financeMovements=function(){return originalMovements().map(e=>{
  const source=e.id.startsWith('owner:')?(db.ownerPayments||[]).find(p=>'owner:'+p.id===e.id):(e.paymentId?db.payments.find(p=>p.id===e.paymentId):null);
  const record=source||e,correlative=String(record.receiptReference||record.receiptRef||record.originalReceiptRef||(source?'':e.reference)||'');
  return {...e,voidedAt:record.voidedAt||(['voided','cancelled'].includes(record.status)?'anulado':null),reference:correlative,correlative};
 }).filter(e=>validSolarDate(String(e.date||''))&&Number.isFinite(Number(e.amount))&&Number(e.amount)>0);};
 // El panel permite consultar una residencial o consolidar todas, incluidos gastos generales.
 financeReport=residentialFinanceReport;
 const scope=()=>financeFilter.residenceId==='all'?'Todas las residenciales y gastos generales':financeResidenceName(financeFilter.residenceId);
 function accumulated(){return financeMovements().filter(e=>!e.voidedAt&&e.kind==='income'&&(financeFilter.residenceId==='all'||e.residenceId===financeFilter.residenceId)).reduce((n,e)=>n+financeCents(e.amount),0)/100;}
 function journal(){const period=financePeriod({...financeFilter,period:'monthly'});return {...financeJournal(financeMovements(),{...period,residenceId:financeFilter.residenceId}),period};}
 function chart(r){
  const width=780,height=265,left=82,top=20,right=18,bottom=43,iw=width-left-right,ih=height-top-bottom;
  const max=Math.max(1,...r.buckets.flatMap(b=>[b.income,b.expense]));
  const x=i=>left+i*iw/Math.max(1,r.buckets.length-1),y=n=>top+ih-ih*n/max;
  return '<svg viewBox="0 0 '+width+' '+height+'" role="img" aria-label="Ingresos y egresos en una sola gráfica"><title>'+esc(r.label)+' · Ingresos y egresos en lempiras</title>'+[0,.25,.5,.75,1].map(t=>'<line x1="'+left+'" x2="'+(width-right)+'" y1="'+y(max*t)+'" y2="'+y(max*t)+'" stroke="currentColor" opacity=".12"/><text x="'+(left-8)+'" y="'+(y(max*t)+4)+'" text-anchor="end">L '+new Intl.NumberFormat('es-HN',{notation:'compact',maximumFractionDigits:1}).format(max*t)+'</text>').join('')+
   ['income','expense'].map((key,k)=>'<polyline data-finance-series="'+key+'" fill="none" stroke="'+(k?'#e78318':'#31991c')+'" stroke-width="3" points="'+r.buckets.map((b,i)=>x(i)+','+y(b[key])).join(' ')+'"/>'+r.buckets.map((b,i)=>'<circle cx="'+x(i)+'" cy="'+y(b[key])+'" r="3" fill="'+(k?'#e78318':'#31991c')+'"><title>'+esc(b.key)+' · '+(k?'Egresos: ':'Ingresos: ')+money(b[key])+'</title></circle>').join('')).join('')+
   r.buckets.map((b,i)=>i%Math.max(1,Math.ceil(r.buckets.length/9))===0||i===r.buckets.length-1?'<text x="'+x(i)+'" y="'+(height-18)+'" text-anchor="middle">'+esc(b.label)+'</text>':'').join('')+'</svg>';
 }
 function cards(r){return '<div class="fn-kpis">'+[
  ['Ingresos totales acumulados',accumulated(),'Todo el historial de la selección','income'],
  ['Ingresos del período',r.income,r.label,'income'],['Egresos del período',r.expense,r.label,'expense'],['Utilidad del período',r.utility,'Ingresos menos egresos','utility']
 ].map(([label,value,note,style])=>'<article class="card fn-kpi fn-'+style+'"><small>'+label+'</small><strong>'+money(value)+'</strong><span>'+esc(note)+'</span></article>').join('')+'</div>';}
 function tableRows(){const r=financeReport();return r.active.filter(e=>(kind==='all'||e.kind===kind)&&(!query||[e.description,e.category,e.payee,e.reference].join(' ').toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es'))));}
 function table(){const rows=tableRows();return '<div class="table-scroll"><table><thead><tr><th>Fecha</th><th>Concepto / cliente</th><th>Tipo</th><th>Ingreso (L)</th><th>Egreso (L)</th></tr></thead><tbody>'+rows.map(e=>'<tr><td>'+fmtDate(e.date)+'</td><td><strong>'+esc(e.description||e.category)+'</strong><small class="fn-row-note">'+esc(e.payee||financeResidenceName(e.residenceId))+'</small></td><td><span class="fn-badge fn-'+e.kind+'">'+(e.kind==='income'?'Ingreso':'Egreso')+'</span></td><td>'+ (e.kind==='income'?money(e.amount):'—')+'</td><td>'+(e.kind==='expense'?money(e.amount):'—')+'</td></tr>').join('')+'</tbody></table>'+(!rows.length?'<p class="empty">No hay movimientos con estos filtros.</p>':'')+'</div>';}
 financePage=function(){
  const r=financeReport(),j=journal();
  return '<div class="fn-dashboard">'+header('Finanzas y utilidad','Ingresos, egresos y movimientos de caja.',
   '<button class="btn btn-primary" data-action="finance-expense">+ Registrar gasto</button><button class="btn btn-outline" data-action="finance-income">+ Otro ingreso</button>')+
   '<div class="fn-scope"><label>Residencial<select data-fn-scope><option value="all" '+(financeFilter.residenceId==='all'?'selected':'')+'>Todas las residenciales</option><option value="general" '+(financeFilter.residenceId==='general'?'selected':'')+'>General / compartido</option>'+db.residences.map(r=>'<option value="'+esc(r.id)+'" '+(r.id===financeFilter.residenceId?'selected':'')+'>'+esc(r.name)+'</option>').join('')+'</select></label></div>'+
   financeFilters(false)+cards(r)+'<div class="fn-main"><section class="card fn-chart"><div class="fn-section-head"><h2>Ingresos y egresos</h2><div class="fn-legend"><span class="fn-income">● Ingresos</span><span class="fn-expense">● Egresos</span></div></div>'+chart(r)+'<p class="sm muted">'+esc(r.label)+' · Misma escala en lempiras</p></section>'+
   '<section class="card fn-journal"><h2>Libro diario mensual</h2><strong>'+esc(j.period.label)+'</strong><label>Mes del libro<select data-fn-book-month>'+financeMonthNames.map((name,i)=>'<option value="'+(i+1)+'" '+(financeFilter.month===i+1?'selected':'')+'>'+name+'</option>').join('')+'</select></label><p>Entradas y salidas por fecha · '+j.rows.length+' movimientos</p><small>'+esc(scope())+' · Año '+financeFilter.year+'</small><button class="btn btn-primary" data-fn-excel>↓ Descargar Excel</button><button class="btn btn-outline" data-fn-pdf>↓ Descargar PDF</button><p class="sm muted">Incluye saldo inicial y saldo final. Excluye anulados.</p></section></div>'+
   '<section class="card"><div class="fn-section-head fn-transactions"><h2>Movimientos del período</h2><div class="fn-tools">'+[['all','Todos'],['income','Ingresos'],['expense','Egresos']].map(([id,label])=>'<button class="btn '+(id===kind?'btn-primary':'btn-outline')+'" data-fn-kind="'+id+'" aria-pressed="'+(id===kind)+'">'+label+'</button>').join('')+'<input type="search" data-fn-search aria-label="Buscar movimiento" placeholder="Buscar movimiento" value="'+esc(query)+'"></div></div><div id="fn-transactions">'+table()+'</div></section>'+
   '<details class="card fn-details"><summary>Revisar, editar o anular movimientos</summary>'+financeTransactionsTable(r.movements.filter(e=>financeShowVoided||!e.voidedAt))+'<label><input type="checkbox" id="finance-show-voided" '+(financeShowVoided?'checked':'')+'> Mostrar anulados</label><button class="btn btn-outline" data-action="finance-print">Reporte con gráficas / imprimir</button></details><p class="sm muted">La utilidad de caja refleja lo recibido menos lo pagado. Las deudas por cobrar, reservas sin pago e históricos sin contabilizar no suman ingresos.</p></div>';
 };
 function excel(){const j=journal(),headers=['Fecha','Concepto','Cliente / beneficiario','Residencial','Correlativo','Ingreso (L)','Egreso (L)','Saldo (L)'];
  const rows=[['','Saldo inicial · '+j.period.label+' · '+scope(),'','','',0,0,j.opening],...j.rows.map(e=>[e.date,e.description||e.category,e.payee||'',financeResidenceName(e.residenceId),e.correlative||'Sin correlativo',e.income,e.expense,e.balance]),['','Totales / saldo final','','','',j.income,j.expense,j.closing]];
  downloadExcel('LOTIGEST_Libro_diario_'+j.period.from.slice(0,7)+'.xlsx',headers,rows,[],'Libro diario');
 }
 function pdf(){const j=journal();download('LOTIGEST_Libro_diario_'+j.period.from.slice(0,7)+'.pdf',financeJournalPdf(j,{company:db.company.name||'GRUPO H',period:j.period.label,scope:scope(),from:j.period.from,to:j.period.to}),'application/pdf');}
 document.addEventListener('click',e=>{const button=e.target.closest?.('[data-fn-excel],[data-fn-pdf],[data-fn-kind]');if(!button)return;e.preventDefault();try{if(button.hasAttribute('data-fn-excel'))excel();else if(button.hasAttribute('data-fn-pdf'))pdf();else{kind=button.dataset.fnKind;render();}}catch(err){toast(err.message,'error');}});
 document.addEventListener('change',e=>{if(e.target.matches('[data-fn-scope]')){financeFilter.residenceId=e.target.value;render();}else if(e.target.matches('[data-fn-book-month]')){financeFilter.month=Number(e.target.value);render();}});
 document.addEventListener('input',e=>{if(e.target.matches('[data-fn-search]')){query=e.target.value;document.getElementById('fn-transactions').innerHTML=table();}});
})();
