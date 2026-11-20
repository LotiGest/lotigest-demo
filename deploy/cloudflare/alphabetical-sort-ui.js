// Orden alfabético exclusivamente visual: nunca cambia el inventario ni los abonos en D1.
// Instalado al final de los adaptadores, para conservar sus búsquedas y acciones.
(function installAlphabeticalListingSort(){
  const collator=new Intl.Collator('es-HN',{sensitivity:'base',numeric:true});
  const order={clients:'az',lots:'default',payments:'default',receipts:'default',collections:'default'};
  function optionsFor(type){
    const options=[['default','Orden actual'],['az','Nombre A–Z'],['za','Nombre Z–A']];
    if(type==='lots')options.push(['block-az','Bloque A–Z'],['block-za','Bloque Z–A']);
    return options.map(([value,label])=>'<option value="'+value+'"'+(order[type]===value?' selected':'')+'>'+label+'</option>').join('');
  }
  function control(type){
    return '<label class="lg-alphabetical-order" style="display:inline-flex;gap:7px;align-items:center;flex-wrap:wrap;font-size:13px;font-weight:650;max-width:100%;color:inherit">'+
      'Ordenar <select data-alphabetical-order="'+type+'" aria-label="Orden alfabético de '+type+'" style="min-height:38px;max-width:100%;box-sizing:border-box">'+
      optionsFor(type)+'</select></label>';
  }
  function enhance(html,type){
    const widget=control(type);
    if(type==='collections' && html.includes('<label>Mes de consulta')){
      return html.replace('<label>Mes de consulta',widget+'<label>Mes de consulta');
    }
    if(html.includes('<div class="toolbar">')){
      return html.replace('<div class="toolbar">','<div class="toolbar">'+widget);
    }
    return html.replace('<div class="table-scroll"',
      '<div style="padding:10px 18px;display:flex;flex-wrap:wrap;gap:10px">'+widget+'</div><div class="table-scroll"');
  }
  const oldClientsPage=clientsPage;
  clientsPage=function(){return enhance(oldClientsPage(),'clients');};
  const oldLotsPage=lotsPage;
  lotsPage=function(){return enhance(oldLotsPage(),'lots');};
  const oldPaymentsPage=paymentsPage;
  paymentsPage=function(){return enhance(oldPaymentsPage(),'payments');};
  const oldReceiptsPage=receiptsPage;
  receiptsPage=function(){return enhance(oldReceiptsPage(),'receipts');};
  const oldCollectionsPage=collectionPage;
  collectionPage=function(){return enhance(oldCollectionsPage(),'collections');};

  function compareNames(a,b,mode){
    const x=String(a||'').trim(),y=String(b||'').trim();
    if(!x&&!y)return 0;
    if(!x)return 1;
    if(!y)return -1;
    const c=collator.compare(x,y);
    return mode==='za'||mode==='block-za'?-c:c;
  }
  function reorder(parent,elements,nameFor,mode){
    if(!parent||elements.length<2||mode==='default')return;
    const rows=elements.map((element,index)=>({element,index,name:nameFor(element)}));
    rows.sort((a,b)=>compareNames(a.name,b.name,mode)||a.index-b.index);
    if(rows.every((r,i)=>r.element===elements[i]))return;
    for(const r of rows)parent.appendChild(r.element);
  }
  function lotFromRow(row){
    const id=row.querySelector('[data-action="view-lot"]')?.dataset.id;
    return id?getLot(id):null;
  }
  function buyerName(row){
    const lot=lotFromRow(row);
    if(!lot)return '';
    const sale=db.sales.find(s=>s.lotId===lot.id);
    const statement=(db.ownershipStatements||[]).find(s=>(s.references||[]).some(r=>r.lotId===lot.id));
    const name=getClient(lot.ownerClientId||sale?.clientId||statement?.clientId)?.name;
    if(name)return name;
    const summary=row.cells[6]?.textContent?.trim()||'';
    return /^(sin comprador|sin propietario|disponible|—|-)\b/i.test(summary)?'':summary;
  }
  function blockName(row){
    const lot=lotFromRow(row);
    return lot?String(lot.block||'')+' / '+String(lot.stage||'')+' / '+String(lot.sourceNumber||lot.id):'';
  }
  function sortTables(type){
    const app=document.getElementById('app');
    if(!app)return;
    const tables=Array.from(app.querySelectorAll('.table-scroll table'));
    for(const table of tables){
      const tbody=table.tBodies[0];
      if(!tbody)continue;
      const headers=Array.from(table.tHead?.rows[0]?.cells||[]).map(th=>th.textContent.trim().toLocaleLowerCase('es'));
      const mode=order[type];
      let nameFor;
      if(type==='clients'&&headers[0]==='nombre completo')nameFor=row=>row.cells[0]?.textContent||'';
      else if(type==='lots'&&headers.includes('comprador / compra'))nameFor=mode.startsWith('block-')?blockName:buyerName;
      else if(type==='payments'&&headers[0]==='cliente')nameFor=row=>row.cells[0]?.textContent||'';
      else if(type==='receipts'){
        const idx=headers.findIndex(h=>h==='cliente'||h==='persona');
        if(idx>=0)nameFor=row=>row.cells[idx]?.textContent||'';
      }
      if(nameFor)reorder(tbody,Array.from(tbody.rows),nameFor,mode);
    }
  }
  function collectionName(article){
    const paragraph=article.querySelector('p.sm');
    if(!paragraph)return '';
    const strong=paragraph.querySelector('strong');
    const value=strong?.firstChild?.textContent||paragraph.firstChild?.textContent||'';
    const name=String(value).trim();
    return /^(sin comprador|sin propietario|por verificar)\b/i.test(name)?'':name;
  }
  function sortCollectionCards(){
    const app=document.getElementById('app');
    if(!app)return;
    const parents=new Set(Array.from(app.querySelectorAll('article.card')).map(card=>card.parentElement));
    for(const parent of parents){
      if(!parent)continue;
      const children=Array.from(parent.children);
      if(children.length<2||!children.every(el=>el.matches('article.card')))continue;
      reorder(parent,children,collectionName,order.collections);
    }
  }
  function sortVisible(){
    if(!Object.prototype.hasOwnProperty.call(order,page))return;
    if(page==='collections')sortCollectionCards();
    else sortTables(page);
  }
  const previousRender=render;
  render=function(){const result=previousRender.apply(this,arguments);sortVisible();return result;};
  document.addEventListener('change',event=>{
    const select=event.target.closest?.('[data-alphabetical-order]');
    if(!select)return;
    const type=select.dataset.alphabeticalOrder;
    if(!Object.prototype.hasOwnProperty.call(order,type))return;
    const valid=['default','az','za',...(type==='lots'?['block-az','block-za']:[])];
    if(!valid.includes(select.value))return;
    order[type]=select.value;
    sortVisible();
  });
})();
