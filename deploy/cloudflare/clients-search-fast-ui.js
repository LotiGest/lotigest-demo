// Keep the directory search input mounted. Index receipts once; never alter db.
(function installClientsSearchFast(){
 const collator=new Intl.Collator('es-HN',{sensitivity:'base',numeric:true});
 let cache=null,table=null,nodes=new Map();
 function index(state){
  const readState=typeof contractPaymentReadView==='function'?contractPaymentReadView(state):state;
  const paid=new Map(),sales=new Map();
  for(const p of readState.payments||[])paid.set(p.saleId,(paid.get(p.saleId)||0)+Number(p.amount||0));
  for(const sale of state.sales||[]){
   const row=sales.get(sale.clientId)||{count:0,balance:0};
   row.count++;row.balance+=Math.max(0,Math.round((Number(sale.price)-(Number(sale.openingPaid)||0)-(paid.get(sale.id)||0))*100)/100);
   sales.set(sale.clientId,row);
  }
  return {state,items:(state.clients||[]).map(c=>({client:c,query:[c.name,c.identity,c.phone].map(v=>String(v??'')).join(' ').toLocaleLowerCase('es'),totals:sales.get(c.id)||{count:0,balance:0}}))};
 }
 function matches(data,query,order='default'){
  const q=String(query||'').toLocaleLowerCase('es'),rows=data.items.filter(x=>!q||x.query.includes(q));
  if(order==='az'||order==='za')rows.sort((a,b)=>{
   const x=String(a.client.name||'').trim(),y=String(b.client.name||'').trim();
   if(!x||!y)return x? -1:y?1:0;
   return (order==='az'?1:-1)*collator.compare(x,y);
  });
  return rows;
 }
 function rowMarkup({client:c,totals:t}){
  return '<tr data-client-id="'+esc(c.id)+'"><td><span class="strong">'+esc(c.name)+'</span></td><td>'+esc(c.identity||'—')+'</td><td>'+esc(c.phone||'—')+'</td><td>'+t.count+'</td><td class="strong tabular">'+money(t.balance)+'</td><td>'+rowActions('view-client',c.id)+' <button class="table-action" data-action="edit-client" data-id="'+esc(c.id)+'" title="Editar">'+ic('edit')+'</button></td></tr>';
 }
 clientsPage=function(){
  cache=index(db);table=null;nodes=new Map();
  const rows=matches(cache,filter);
  return header('Clientes','Mantén ordenados los datos y los terrenos adquiridos por cada cliente.',button(ic('plus')+' Nuevo cliente','new-client','btn-primary'))+
   '<div class="card" data-client-directory><div class="panel-table-head"><h2>Directorio de clientes</h2><span class="sm muted">'+rows.length+' clientes</span></div><div style="padding:0 19px">'+toolbar('Buscar nombre, identidad o teléfono…')+'</div><div class="table-scroll" tabindex="0" role="region" aria-label="Tabla desplazable horizontalmente"><table><thead><tr><th>Nombre completo</th><th>Identidad</th><th>Teléfono</th><th>Terrenos</th><th>Saldo por cobrar</th><th>Opciones</th></tr></thead><tbody>'+rows.map(rowMarkup).join('')+'</tbody></table><div class="empty" '+(rows.length?'hidden':'')+'>No hay clientes con ese criterio.</div></div></div>';
 };
 document.addEventListener('input',event=>{
  const input=event.target;
  if(page!=='clients'||!input.matches?.('[data-filter="search"]'))return;
  const host=input.closest('[data-client-directory]'),body=host?.querySelector('tbody');
  if(!body)return;
  filter=input.value;
  if(!cache||cache.state!==db){cache=index(db);table=null;nodes=new Map();}
  if(table!==body){
   table=body;
   for(const row of body.rows)nodes.set(row.dataset.clientId,row);
  }
  const order=host.querySelector('[data-alphabetical-order="clients"]')?.value||'default';
  const rows=matches(cache,filter,order);
  const current=Array.from(body.rows);
  if(current.length!==rows.length||current.some((r,i)=>r.dataset.clientId!==String(rows[i].client.id))){
   const fragment=document.createDocumentFragment(),template=document.createElement('template');
   for(const item of rows){
    const id=String(item.client.id);let node=nodes.get(id);
    if(!node){template.innerHTML=rowMarkup(item);node=template.content.firstElementChild;nodes.set(id,node);}
    fragment.append(node);
   }
   body.replaceChildren(fragment);
  }
  const label=host.querySelector('.panel-table-head .sm');if(label)label.textContent=rows.length+' clientes';
  const empty=host.querySelector('.empty');if(empty)empty.hidden=rows.length>0;
  event.stopImmediatePropagation();
 },true);
})();
