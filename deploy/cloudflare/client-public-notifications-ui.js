// Alertas de solicitudes de solares enviadas por el enlace público de WhatsApp.
// Solo se muestra en el panel autenticado del administrador.
function clientSolarPendingRequests(){
 return (clientRequests||[]).filter(r=>r.status==='pending'||r.status==='quoted');
}
function clientSolarNotificationMarkup(){
 if(clientRequestsError)return '<p class="sm" role="status">No se pudieron actualizar las solicitudes. Abre Pendientes para reintentar.</p>';
 if(!clientRequestsLoaded)return '<p class="sm muted">Consultando solicitudes…</p>';
 const requests=clientSolarPendingRequests();
 if(!requests.length)return '<p class="sm muted">No hay nuevas solicitudes de solares.</p>';
 return '<p class="sm"><strong>'+requests.length+' solicitud'+(requests.length===1?'':'es')+' por revisar</strong></p>'+
 requests.slice(0,6).map(r=>{
  const stage=r.lot?.stage||'—',block=r.lot?.block||'—',solar=r.lot?.number||r.lotId||'—';
  const label='Etapa '+stage+' · Bloque '+block+' · Solar '+solar;
  return '<button type="button" class="lg-popup-action" data-action="client-pending-open" data-id="'+esc(r.id)+'" style="display:block;text-align:left;width:100%;white-space:normal;padding:10px 8px;border-bottom:1px solid rgba(75,110,85,.18)">'+
   '<strong style="display:block">'+esc(r.client?.name||'Cliente')+'</strong>'+
   '<small style="display:block">'+esc(r.title||'Residencial')+' · '+esc(label)+'</small>'+
   '<small style="display:block">'+(r.status==='quoted'?'Cotización preparada':'Solicitud por revisar')+
   (r.client?.mode==='credit'?' · Prima propuesta '+money(r.client.proposedDownPayment||0):' · Contado')+'</small>'+
   '</button>';
 }).join('')+
 (requests.length>6?'<p class="sm muted">Hay más solicitudes en Pendientes.</p>':'')+
 '<button type="button" class="lg-popup-action" data-action="client-pending-open">Ver todas las solicitudes</button>';
}
function clientSolarNotificationUpdate(){
 const count=clientSolarPendingRequests().length;
 const badge=document.querySelector('[data-public-solar-badge]');
 if(badge){
  badge.textContent=count?String(count>99?'99+':count):'';
  badge.style.display=count?'inline-flex':'none';
  badge.setAttribute('aria-label',count+' solicitudes de solares pendientes');
 }
 const listing=document.getElementById('lg-public-solar-notifications');
 if(listing)listing.innerHTML=clientSolarNotificationMarkup();
 const bell=document.querySelector('[data-lg-action="notifications"]');
 if(bell)bell.title=count?'Notificaciones · '+count+' solicitudes de solares':'Notificaciones';
}
document.addEventListener('click',event=>{
 if(event.target.closest?.('[data-lg-action="notifications"]')&&cloudReady&&cloudUser?.role==='admin'){
  refreshClientRequests();
 }
},true);
