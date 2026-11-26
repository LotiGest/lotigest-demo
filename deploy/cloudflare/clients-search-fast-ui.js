// Keep the active search input mounted while filtering clients.
(function installClientsSearchFast(){
 document.addEventListener('input',event=>{
  const input=event.target;
  if(page!=='clients'||!input.matches?.('[data-filter="search"]'))return;
  filter=input.value;
  const old=document.querySelector('.table-scroll tbody');if(!old)return;
  const sales=new Map();for(const sale of db.sales){const group=sales.get(sale.clientId)||[];group.push(sale);sales.set(sale.clientId,group);}
  const query=filter.toLocaleLowerCase(),clients=db.clients.filter(c=>!query||`${c.name} ${c.identity} ${c.phone}`.toLocaleLowerCase().includes(query));
  old.innerHTML=clients.map(c=>{const group=sales.get(c.id)||[];return `<tr><td><span class="strong">${esc(c.name)}</span></td><td>${esc(c.identity||'—')}</td><td>${esc(c.phone||'—')}</td><td>${group.length}</td><td class="strong tabular">${money(sum(group,x=>balance(x)))}</td><td>${rowActions('view-client',c.id)} <button class="table-action" data-action="edit-client" data-id="${esc(c.id)}" title="Editar">${ic('edit')}</button></td></tr>`;}).join('');
  const count=document.querySelector('.panel-table-head .sm');
  if(count)count.textContent=clients.length+' clientes';
  const empty=old.closest('.table-scroll')?.querySelector('.empty');if(empty)empty.hidden=clients.length>0;
  event.stopImmediatePropagation();
 },true);
})();
