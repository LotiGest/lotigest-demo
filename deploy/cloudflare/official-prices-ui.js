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
const officialPriceSolarBase=openSolarWindow;
openSolarWindow=function(lotId){
 officialPriceSolarBase(lotId);
 const l=getLot(lotId),content=document.querySelector('#modal-root .modal-content');
 if(!l||!content)return;
 const saleForm=document.getElementById('solar-form');
 if(saleForm&&officialPriceEligible(l)){
  saleForm.elements.downPayment.value=String(l.quotePrima??l.pdfPrima??0);
  saleForm.elements.months.value=String(l.quoteMonths||84);
  updateSolarSummary();
 }
 const pricePanel='<section class="card" style="padding:14px;margin:12px 0"><h3>Precio y financiamiento</h3>'+
  '<div class="detail-line"><span>Precio total</span><strong>'+(Number(l.price)>0?money(l.price):'Sin precio')+'</strong></div>'+
  officialPriceVisible(l)+
  (officialPriceAuthorized()&&officialPriceEligible(l)?'<button class="btn btn-primary" type="button" data-action="official-lot-edit" data-id="'+esc(l.id)+'">Editar precio, prima y plazo</button>':'')+
  '</section>';
 content.insertAdjacentHTML('afterbegin',pricePanel);
};
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