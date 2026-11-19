// Completar precios vacíos desde la tabla oficial y negociar una prima/plazo por solar.
// Este panel es exclusivamente administrativo; nunca altera ventas o apartados.
let officialPricePreview=null;
function officialPriceFormat(l){return Number(l??0).toLocaleString('es-HN',{minimumFractionDigits:2,maximumFractionDigits:2});}
function officialPriceVisible(l){
 if(l.priceVara2==null&&l.pdfPrima==null&&l.quotePrima==null)return '<p class="sm muted">Precio por vara², prima y cuota del PDF pendientes de incorporar.</p>';
 const valid=Number(l.price)>0;
 const down=Number(l.quotePrima??l.pdfPrima??0),months=Number(l.quoteMonths||84);
 let quota='Por definir';try{if(valid)quota='L '+officialPriceFormat(quoteAtZeroInterest(l.price,down,months));}catch{}
 return '<div class="detail-line"><span>Valor de vara²</span><strong>'+(Number(l.priceVara2)>0?'L '+officialPriceFormat(l.priceVara2):'Pendiente')+'</strong></div>'+
 '<div class="detail-line"><span>Área en varas²</span><strong>'+(Number(l.areaVaras2)>0?officialPriceFormat(l.areaVaras2):'Pendiente')+'</strong></div>'+
 '<div class="detail-line"><span>Prima del PDF</span><strong>'+(Number.isFinite(Number(l.pdfPrima))?'L '+officialPriceFormat(l.pdfPrima):'Pendiente')+'</strong></div>'+
 '<div class="detail-line"><span>Cuota del PDF</span><strong>'+(Number.isFinite(Number(l.pdfCuota))?'L '+officialPriceFormat(l.pdfCuota):'Pendiente')+'</strong></div>'+
 '<div class="detail-line"><span>Precio total PDF</span><strong>'+(Number.isFinite(Number(l.pdfPrecioTotal))?'L '+officialPriceFormat(l.pdfPrecioTotal):'Pendiente')+'</strong></div>'+
 '<div class="detail-line"><span>Prima a negociar</span><strong>L '+officialPriceFormat(down)+'</strong></div>'+
 '<div class="detail-line"><span>Plazo y nueva cuota sin intereses</span><strong>'+(months/12)+' años · '+months+' cuotas · '+quota+'</strong></div>';
}
const officialPriceInventoryBase=inventoryInfo;
inventoryInfo=function(l){return officialPriceInventoryBase(l)+(l.priceVara2!=null||l.pdfPrima!=null||l.quotePrima!=null?officialPriceVisible(l):'');};
function officialPriceAuthorized(){return Boolean(cloudUser?.role==='admin'&&cloudReady);}
function officialPriceEligible(l){return l&&l.residenceId===residence().id&&isAvailableForPricing(db,l);}
// Calculadora visible inmediatamente al tocar el solar en el mapa.
// No necesita seleccionar cliente ni abrir una segunda ventana.
function officialMapQuoteMarkup(l){
 const price=Number(l.price)>0?String(l.price):'';
 const prima=String(l.quotePrima??l.pdfPrima??0);
 const years=String(Number(l.quoteMonths||84)/12);
 return '<div id="official-map-quote" data-lot-id="'+esc(l.id)+'" style="margin-top:14px;padding:14px;border:1px solid rgba(80,120,95,.28);border-radius:14px">'+
  '<h3 style="margin:0 0 8px">Calculadora de cuota</h3>'+
  '<p class="sm muted" style="margin:0 0 12px">Escribe cuánto dará de prima el cliente. La cuota se recalcula al instante, sin intereses (0 %).</p>'+
  '<div class="form-grid">'+
  '<div class="field-group"><label for="official-map-price">Precio total del solar (L)</label><input id="official-map-price" type="number" inputmode="decimal" min="0.01" step="0.01" value="'+esc(price)+'" placeholder="Precio del solar"></div>'+
  '<div class="field-group"><label for="official-map-prima">Prima que dará el cliente (L)</label><input id="official-map-prima" type="number" inputmode="decimal" min="0" step="0.01" value="'+esc(prima)+'"></div>'+
  '<div class="field-group"><label for="official-map-years">Años de financiamiento</label><input id="official-map-years" type="number" inputmode="numeric" min="1" max="30" step="1" value="'+esc(years)+'"></div>'+
  '<div class="field-group"><label>Cuotas mensuales</label><strong id="official-map-months" style="display:block;padding-top:10px">84 cuotas</strong></div>'+
  '</div>'+
  '<div class="sale-summary" style="margin-top:12px"><div class="detail-line"><span>Saldo a financiar</span><strong id="official-map-financed">—</strong></div>'+
  '<div class="detail-line"><span>Nueva cuota mensual</span><strong id="official-map-monthly" aria-live="polite" style="font-size:1.25rem">—</strong></div></div>'+
  '<p class="sm" id="official-map-error" role="status" aria-live="polite"></p>'+
  '<p class="sm muted" id="official-map-save-status">Los cambios son una simulación hasta que guardes la propuesta.</p>'+
  '<button type="button" class="btn btn-primary" data-action="official-map-save" data-id="'+esc(l.id)+'" id="official-map-save">Guardar precio, prima y plazo</button>'+
  '</div>';
}
function officialMapMoney(raw,label){
 if(!/^\d+(?:\.\d{1,2})?$/.test(String(raw).trim()))throw Error(label+': usa un importe válido con máximo dos decimales.');
 const n=Number(raw);
 if(!Number.isFinite(n)||!Number.isSafeInteger(Math.round(n*100))||n>1e12)throw Error(label+': revisa el monto.');
 return n;
}
function officialMapQuoteRead(panel){
 if(!panel)throw Error('No se encontró la calculadora del solar.');
 const price=officialMapMoney(panel.querySelector('#official-map-price')?.value,'Precio');
 const prima=officialMapMoney(panel.querySelector('#official-map-prima')?.value,'Prima');
 const rawYears=String(panel.querySelector('#official-map-years')?.value??'').trim();
 if(!/^\d+$/.test(rawYears))throw Error('Indica el plazo en años completos.');
 const years=Number(rawYears);
 if(years<1||years>30)throw Error('El plazo debe estar entre 1 y 30 años.');
 if(price<=0)throw Error('El precio del solar debe ser mayor que cero.');
 if(prima>=price)throw Error('La prima debe ser menor que el precio. Para el total utiliza venta al contado.');
 const months=years*12;
 return {price,prima,months,monthly:quoteAtZeroInterest(price,prima,months)};
}
function officialMapQuoteChanged(l,q){
 return Number(l.price||0)!==q.price ||
        Number(l.quotePrima??l.pdfPrima??0)!==q.prima ||
        Number(l.quoteMonths||84)!==q.months;
}
function officialMapQuoteRefresh(){
 const panel=document.getElementById('official-map-quote');
 if(!panel)return;
 const l=getLot(panel.dataset.lotId),form=document.getElementById('solar-form'),
       monthly=panel.querySelector('#official-map-monthly'),
       financed=panel.querySelector('#official-map-financed'),
       months=panel.querySelector('#official-map-months'),
       error=panel.querySelector('#official-map-error'),
       status=panel.querySelector('#official-map-save-status'),
       save=panel.querySelector('#official-map-save'),
       submit=document.getElementById('solar-submit');
 let q=null;
 try {
  if(!officialPriceAuthorized()||!officialPriceEligible(l))throw Error('No se puede modificar este solar porque ya no está disponible.');
  q=officialMapQuoteRead(panel);
  monthly.textContent='L '+officialPriceFormat(q.monthly);
  financed.textContent='L '+officialPriceFormat(q.price-q.prima);
  months.textContent=q.months+' cuotas';
  error.textContent='';
  const pending=officialMapQuoteChanged(l,q);
  status.textContent=pending?'Prima y cuota calculadas. Guarda la propuesta para utilizar estos valores en una venta.':'Propuesta guardada; puedes seleccionar el cliente y registrar la venta a crédito.';
  save.disabled=!pending;
  if(form){
   form.elements.downPayment.value=String(q.prima);
   form.elements.months.value=String(q.months);
   // El resumen utiliza la simulación sin reescribir datos de ventas previas.
   const mode=form.elements.operation.value,summary=document.getElementById('solar-sale-summary');
   if(summary&&mode==='credit'){
    summary.innerHTML='<div class="detail-line"><span>Precio propuesto</span><strong>L '+officialPriceFormat(q.price)+'</strong></div>'+
     '<div class="detail-line"><span>Prima propuesta</span><strong>L '+officialPriceFormat(q.prima)+'</strong></div>'+
     '<div class="detail-line"><span>Saldo a financiar</span><strong>L '+officialPriceFormat(q.price-q.prima)+'</strong></div>'+
     '<div class="detail-line"><span>Cuota mensual · '+q.months+' meses</span><strong>L '+officialPriceFormat(q.monthly)+'</strong></div>'+
     (pending?'<p class="sm" style="color:#ad6515">Guarda la propuesta antes de confirmar la venta.</p>':'');
   }
   if(summary&&mode==='cash'&&pending)summary.insertAdjacentHTML('beforeend','<p class="sm" style="color:#ad6515">Guarda el precio propuesto antes de confirmar la venta.</p>');
   if(submit&&pending&&['credit','cash'].includes(mode)){submit.disabled=true;submit.title='Primero guarda el precio, prima y plazo';}
  }
 } catch(e){
  monthly.textContent='—';
  financed.textContent='—';
  months.textContent='—';
  error.textContent=e.message;
  status.textContent='Corrige los valores para calcular una cuota válida.';
  save.disabled=true;
  if(submit&&form&&['credit','cash'].includes(form.elements.operation.value)){
    submit.disabled=true;submit.title='Primero corrige la prima o el precio';
  }
 }
 return q;
}
const officialPriceSolarBase=openSolarWindow;
openSolarWindow=function(lotId){
 officialPriceSolarBase(lotId);
 const l=getLot(lotId),content=document.querySelector('#modal-root .modal-content');
 if(!l||!content)return;
 const permitted=officialPriceAuthorized()&&officialPriceEligible(l);
 const saleForm=document.getElementById('solar-form');
 if(saleForm&&officialPriceEligible(l)){
  saleForm.elements.downPayment.value=String(l.quotePrima??l.pdfPrima??0);
  saleForm.elements.months.value=String(l.quoteMonths||84);
  updateSolarSummary();
 }
 const pricePanel='<section class="card" style="padding:14px;margin:12px 0"><h3>Precio y financiamiento</h3>'+
  '<div class="detail-line"><span>Precio total registrado</span><strong id="official-map-stored-price">'+(Number(l.price)>0?money(l.price):'Sin precio')+'</strong></div>'+
  '<div id="official-map-baseline">'+officialPriceVisible(l)+'</div>'+
  (permitted?officialMapQuoteMarkup(l):'')+
  '</section>';
 content.insertAdjacentHTML('afterbegin',pricePanel);
 if(permitted){
  // Los campos de venta siguen vinculados pero no aparecen duplicados debajo.
  const creditFields=saleForm?.querySelector('#solar-credit-fields');
  if(creditFields)creditFields.style.display='none';
  officialMapQuoteRefresh();
 }
};
const officialMapUpdateSolarWindowBase=updateSolarWindow;
updateSolarWindow=function(...args){
 const output=officialMapUpdateSolarWindowBase(...args);
 officialMapQuoteRefresh();
 return output;
};
function officialMapQuoteSave(id){
 if(!officialPriceAuthorized())throw Error('Solo un administrador puede modificar el precio y la prima.');
 const l=getLot(id),panel=document.getElementById('official-map-quote');
 if(!l||!officialPriceEligible(l)||!panel||panel.dataset.lotId!==id)
  throw Error('El solar cambió de estado. Reabre el mapa para verificarlo.');
 const q=officialMapQuoteRead(panel);
 const values=['price','quotePrima','quoteMonths','quoteMonthly'];
 const previous=Object.fromEntries(values.map(k=>[k,{present:Object.prototype.hasOwnProperty.call(l,k),value:l[k]}]));
 l.price=q.price;l.quotePrima=q.prima;l.quoteMonths=q.months;l.quoteMonthly=q.monthly;
 if(!designPersist()){
  for(const [k,v] of Object.entries(previous)){if(v.present)l[k]=v.value;else delete l[k];}
  return;
 }
 const registered=document.getElementById('official-map-stored-price');
 if(registered)registered.textContent=money(l.price);
 const baseline=document.getElementById('official-map-baseline');
 if(baseline)baseline.innerHTML=officialPriceVisible(l);
 updateSolarWindow();
 toast('Propuesta guardada: prima L '+officialPriceFormat(q.prima)+' · '+q.months+' cuotas de L '+officialPriceFormat(q.monthly)+'. No se registró ningún abono.');
}
document.addEventListener('input',e=>{
 if(e.target?.closest?.('#official-map-quote'))updateSolarWindow();
});
document.addEventListener('submit',e=>{
 if(e.target?.id!=='solar-form'||!document.getElementById('official-map-quote'))return;
 const panel=document.getElementById('official-map-quote'),l=getLot(panel.dataset.lotId);
 try{
  const quote=officialMapQuoteRead(panel);
  if(officialMapQuoteChanged(l,quote))throw Error('Primero guarda el precio y la prima para registrar esta venta.');
 }catch(err){
  const output=document.getElementById('solar-form-error');
  if(output)output.textContent=err.message;
  e.preventDefault();
  e.stopImmediatePropagation();
 }
},true);
const officialPriceLotsBase=lotsPage;
lotsPage=function(){
 const result=officialPriceLotsBase();
 if(!officialPriceAuthorized()||!String(residence().name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().includes('ALTOS DEL ARRAYAN'))return result;
 return '<section class="card" style="padding:14px;margin:10px 0"><strong>Precios oficiales de Altos del Arrayán</strong><p class="sm">Completar únicamente los datos faltantes de solares disponibles, etapa 1; compradores, apartados, ventas y pagos quedan protegidos. 32 filas dudosas de L, N y O requieren revisión manual.</p><button class="btn btn-outline" type="button" data-action="official-prices-preview">Revisar precios faltantes del PDF</button></section>'+result;
};
function officialPriceOpenPreview(){
 if(!officialPriceAuthorized())throw Error('Solo el administrador puede completar precios.');
 const snapshot=JSON.stringify(db),rid=residence().id,plan=prepareOfficialPriceFill(db,rid);
 officialPricePreview={snapshot,rid,plan};
 const list=(label,rows)=>'<p><strong>'+rows.length+' '+label+'</strong></p>'+(rows.length?'<p class="sm" style="max-height:110px;overflow:auto">'+esc(rows.slice(0,30).join(' · '))+(rows.length>30?'…':'')+'</p>':'');
 showModal('Precios oficiales del PDF','<p>Fuente: PDF de precios de Altos del Arrayán. Solo se completan los campos faltantes cuando el solar es único, disponible, sin propietario, apartado, contrato o historial por revisar.</p>'+
  '<p><strong>'+plan.catalogCount+' solares con referencia consistente</strong> · '+plan.excludedPdfRows+' referencias del PDF excluidas por rótulo contradictorio.</p>'+
  list('solares para completar',plan.changes)+list('ocupados o protegidos',plan.skipped)+list('sin correspondencia única en etapa 1',plan.missing)+list('conflictos',plan.conflicts)+
  '<p class="sm">No se crean terrenos nuevos ni ventas. Los precios existentes diferentes al PDF no se cambian automáticamente.</p>',
  '<button class="btn btn-soft" data-action="close-modal">Cancelar</button><button class="btn btn-primary" data-action="official-prices-confirm" '+(!plan.changes.length?'disabled':'')+'>Aplicar '+plan.changes.length+' cambios</button>',true);
}
function officialPriceConfirm(){
 const p=officialPricePreview;
 if(!p||!officialPriceAuthorized())throw Error('Revisa primero los precios.');
 if(p.rid!==residence().id||JSON.stringify(db)!==p.snapshot)throw Error('Los datos cambiaron. Vuelve a revisar el PDF antes de aplicar.');
 const before=db;db=p.plan.state;
 if(!designPersist()){db=before;return;}
 officialPricePreview=null;closeModal();render();
 toast(p.plan.changes.length+' solares completados desde el PDF. Confirma que aparezca «✓ Guardado» en la nube.');
}
function officialPriceEditLot(id){
 if(!officialPriceAuthorized())throw Error('Solo administradores pueden editar precios.');
 const l=getLot(id);
 if(!officialPriceEligible(l))throw Error('El solar está vendido, apartado, tiene propietario o requiere revisión; no se puede cambiar su oferta.');
 const price=Number(l.price)>0?l.price:'',down=l.quotePrima??l.pdfPrima??0,months=l.quoteMonths||84;
 showModal('Editar precio y nueva cuota','<p><strong>Etapa '+esc(l.stage||'—')+' · Bloque '+esc(l.block)+' · Solar '+esc(l.sourceNumber||l.id)+'</strong></p><p class="sm">Simulación sin intereses. Cambiar la prima o el plazo recalcula la cuota inmediatamente; no registra ningún abono.</p>'+
  '<form id="official-lot-price-form" data-id="'+esc(l.id)+'" class="form-grid">'+
  field('Precio total (L)','price',price,{type:'number',min:1,step:'.01',required:true})+
  field('Prima que dará el cliente (L)','prima',down,{type:'number',min:0,step:'.01',required:true})+
  field('Plazo en años','years',months/12,{type:'number',min:1,step:1,required:true})+
  '<div class="field-group"><label>Cuota mensual (L)</label><strong id="official-new-quota" aria-live="polite">—</strong></div></form>'+
  '<p class="sm">Referencia PDF: '+(Number(l.pdfPrecioTotal)>0?'precio L '+officialPriceFormat(l.pdfPrecioTotal)+' · prima L '+officialPriceFormat(l.pdfPrima)+' · cuota L '+officialPriceFormat(l.pdfCuota):'datos oficiales todavía pendientes')+'.</p>',
  '<button class="btn btn-soft" data-action="close-modal">Cancelar</button><button class="btn btn-primary" data-action="official-lot-save" data-id="'+esc(l.id)+'">Guardar oferta del solar</button>');
 officialPriceUpdateQuota();
}
function officialPriceUpdateQuota(){
 const form=document.getElementById('official-lot-price-form'),target=document.getElementById('official-new-quota');
 if(!form||!target)return;
 const price=Number(form.elements.price.value),down=Number(form.elements.prima.value),years=Number(form.elements.years.value),months=years*12;
 if(!form.elements.price.value||!form.elements.prima.value||!form.elements.years.value||!Number.isInteger(years)||years<1||years>30){target.textContent='Completa precio, prima y años';return;}
 try{target.textContent='L '+officialPriceFormat(quoteAtZeroInterest(price,down,months))+' × '+months+' cuotas';}
 catch(e){target.textContent=e.message;}
}
function officialPriceSaveLot(id){
 if(!officialPriceAuthorized())throw Error('Solo administradores pueden editar precios.');
 const lot=getLot(id),form=document.getElementById('official-lot-price-form');
 if(!form||form.dataset.id!==id||!officialPriceEligible(lot))throw Error('El solar cambió de estado. Reabre la ficha.');
 const price=Number(form.elements.price.value),down=Number(form.elements.prima.value),years=Number(form.elements.years.value),months=years*12;
 const cents=v=>Number.isFinite(v)&&Math.abs(v*100-Math.round(v*100))<.00001;
 if(!Number.isInteger(years)||years<1||years>30||!cents(price)||!cents(down))throw Error('Ingresa años enteros y montos con máximo dos decimales.');
 if(down>=price)throw Error('Para pagar el precio completo utiliza la venta al contado. La prima al crédito debe ser menor.');
 const monthly=quoteAtZeroInterest(price,down,months),original={...lot};
 lot.price=price;lot.quotePrima=down;lot.quoteMonths=months;lot.quoteMonthly=monthly;
 if(!designPersist()){Object.assign(lot,original);return;}
 closeModal();render();toast('Oferta actualizada: '+months+' cuotas de L '+officialPriceFormat(monthly)+'. No se registró una venta ni un pago.');
}
const officialPriceActionsBase=handlerAction;
handlerAction=function(action,el){
 try{
  if(action==='official-prices-preview')return officialPriceOpenPreview();
  if(action==='official-prices-confirm')return officialPriceConfirm();
  if(action==='official-lot-edit')return officialPriceEditLot(el.dataset.id);
  if(action==='official-lot-save')return officialPriceSaveLot(el.dataset.id);
 }catch(e){toast(e.message,'error');return;}
 return officialPriceActionsBase(action,el);
};
document.addEventListener('input',e=>{if(e.target.closest?.('#official-lot-price-form'))officialPriceUpdateQuota();});