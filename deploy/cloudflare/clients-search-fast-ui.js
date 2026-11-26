// Keep the active search input mounted while filtering clients.
(function installClientsSearchFast(){
 // Same client page and controls, with sales grouped once per render.
 clientsPage=function(){const salesByClient=new Map();for(const sale of db.sales){const rows=salesByClient.get(sale.clientId)||[];rows.push(sale);salesByClient.set(sale.clientId,rows);}const list=db.clients.filter(c=>!filter||`${c.name} ${c.identity} ${c.phone}`.toLowerCase().includes(filter.toLowerCase()));return `${header('Clientes','Mantén ordenados los datos y los terrenos adquiridos por cada cliente.',button(`${ic('plus')} Nuevo cliente`,'new-client','btn-primary'))}<div class="card"><div class="panel-table-head"><h2>Directorio de clientes</h2><span class="sm muted">${list.length} clientes</span></div><div style="padding:0 19px">${toolbar('Buscar nombre, identidad o teléfono…')}</div><div class="table-scroll" tabindex="0" role="region" aria-label="Tabla desplazable horizontalmente"><table><thead><tr><th>Nombre completo</th><th>Identidad</th><th>Teléfono</th><th>Terrenos</th><th>Saldo por cobrar</th><th>Opciones</th></tr></thead><tbody>${list.map(c=>{let s=salesByClient.get(c.id)||[];return `<tr data-client-id="${esc(c.id)}"><td><span class="strong">${esc(c.name)}</span></td><td>${esc(c.identity||'—')}</td><td>${esc(c.phone||'—')}</td><td>${s.length}</td><td class="strong tabular">${money(sum(s,x=>balance(x)))}</td><td>${rowActions('view-client',c.id)} <button class="table-action" data-action="edit-client" data-id="${esc(c.id)}" title="Editar">${ic('edit')}</button></td></tr>`}).join('')}</tbody></table>${!list.length?'<div class="empty">No hay clientes con ese criterio.</div>':''}</div></div>`};
 document.addEventListener('input',event=>{
  const input=event.target;
  if(page!=='clients'||!input.matches?.('[data-filter="search"]'))return;
  filter=input.value;
  const old=document.querySelector('.table-scroll tbody');if(!old)return;
  const query=filter.toLocaleLowerCase();
  if(db.clients.length>2000){
   const sales=new Map();for(const sale of db.sales){const group=sales.get(sale.clientId)||[];group.push(sale);sales.set(sale.clientId,group);}
   const visible=db.clients.filter(c=>!query||`${c.name} ${c.identity} ${c.phone}`.toLocaleLowerCase().includes(query));
   const order=document.querySelector('[data-alphabetical-order="clients"]')?.value||'az';
   if(order==='az'||order==='za'){const collator=new Intl.Collator('es-HN',{sensitivity:'base',numeric:true});visible.sort((a,b)=>(order==='az'?1:-1)*collator.compare(a.name||'',b.name||''));}
   old.innerHTML=visible.map(c=>{const group=sales.get(c.id)||[];return `<tr data-client-id="${esc(c.id)}"><td><span class="strong">${esc(c.name)}</span></td><td>${esc(c.identity||'—')}</td><td>${esc(c.phone||'—')}</td><td>${group.length}</td><td class="strong tabular">${money(sum(group,x=>balance(x)))}</td><td>${rowActions('view-client',c.id)} <button class="table-action" data-action="edit-client" data-id="${esc(c.id)}" title="Editar">${ic('edit')}</button></td></tr>`;}).join('');
   const label=document.querySelector('.panel-table-head .sm');if(label)label.textContent=visible.length+' clientes';
   const scroll=old.closest('.table-scroll');let empty=scroll?.querySelector('.empty');if(!empty&&scroll){empty=document.createElement('div');empty.className='empty';empty.textContent='No hay clientes con ese criterio.';scroll.append(empty);}if(empty)empty.hidden=visible.length>0;
   event.stopImmediatePropagation();return;
  }
  const clients=new Map(db.clients.map(c=>[c.id,c]));let count=0;
  for(const row of old.rows){
   const id=row.dataset.clientId||row.querySelector('[data-action="edit-client"]')?.dataset.id;
   const client=clients.get(id);
   const show=!!client&&(!query||`${client.name} ${client.identity} ${client.phone}`.toLocaleLowerCase().includes(query));
   if(row.hidden===show)row.hidden=!show;
   if(show)count++;
  }
  const label=document.querySelector('.panel-table-head .sm');if(label)label.textContent=count+' clientes';
  const scroll=old.closest('.table-scroll');let empty=scroll?.querySelector('.empty');
  if(!empty&&scroll){empty=document.createElement('div');empty.className='empty';empty.textContent='No hay clientes con ese criterio.';scroll.append(empty);}
  if(empty)empty.hidden=count>0;
  event.stopImmediatePropagation();
 },true);
})();
