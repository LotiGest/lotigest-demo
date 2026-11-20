// Filtros combinados del inventario: etapa, bloque y solar.
// Solo modifica la vista, nunca altera ventas, solares ni registros persistidos.
(function installLotLocationFilters(){
  const selection={stage:'all',solar:'all'};
  const compare=new Intl.Collator('es-HN',{numeric:true,sensitivity:'base'});
  let lastResidence=null;
  const value=v=>String(v??'').trim();
  const number=v=>value(v).toUpperCase().replace(/^0+(?=\d)/,'');
  const stageOf=l=>value(l.stage)||'missing';
  const solarOf=l=>value(l.sourceNumber??l.number);
  const stageMatches=l=>selection.stage==='all'||stageOf(l)===selection.stage;
  const blockMatches=l=>inventoryBlockFilter==='all'||value(l.block)===value(inventoryBlockFilter);
  const solarMatches=l=>selection.solar==='all'||number(solarOf(l))===number(selection.solar);
  const option=(v,title,selected)=>'<option value="'+esc(v)+'"'+(selected?' selected':'')+'>'+esc(title)+'</option>';

  const priorLotsPage=lotsPage;
  lotsPage=function(){
    const rid=residence()?.id??null;
    if(rid!==lastResidence){
      lastResidence=rid;
      selection.stage='all';
      selection.solar='all';
      inventoryBlockFilter='all';
    }
    const original=priorLotsPage.apply(this,arguments);
    const pool=typeof residenceLots==='function'?residenceLots():db.lots;
    const stages=[...new Set(pool.map(stageOf))].sort(compare.compare);
    const stageOptions=option('all','Todas las etapas',selection.stage==='all')+
      stages.map(s=>option(s,s==='missing'?'Sin etapa':'Etapa '+s,selection.stage===s)).join('');
    const blocks=[...new Set(pool.filter(stageMatches).map(l=>value(l.block)).filter(Boolean))].sort(compare.compare);
    const blockOptions=option('all','Todos los bloques',inventoryBlockFilter==='all')+
      blocks.map(b=>option(b,'Bloque '+b,inventoryBlockFilter===b)).join('');
    const solarPool=pool.filter(l=>stageMatches(l)&&blockMatches(l));
    const numbers=[...new Set(solarPool.map(solarOf).filter(Boolean))].sort(compare.compare);
    const solarOptions=option('all','Todos los solares',selection.solar==='all')+
      numbers.map(n=>option(n,'Solar '+n,number(selection.solar)===number(n))).join('');
    const controls='<label for="inventory-stage">Etapa<select id="inventory-stage" aria-label="Filtrar terrenos por etapa">'+stageOptions+'</select></label>'+
      '<label for="inventory-block">Bloque<select id="inventory-block" aria-label="Filtrar terrenos por bloque">'+blockOptions+'</select></label>'+
      '<label for="inventory-solar">Solar<select id="inventory-solar" aria-label="Filtrar terrenos por número de solar">'+solarOptions+'</select></label>'+
      '<button type="button" class="btn btn-outline" id="inventory-location-clear" style="align-self:end;min-height:38px">Limpiar ubicación</button>';
    return original.replace(/<label>Bloque<select id="inventory-block">[\s\S]*?<\/select><\/label>/,controls);
  };

  function apply(){
    const app=document.getElementById('app');
    if(!app)return;
    const table=[...app.querySelectorAll('.table-scroll table')].find(t=>
      (t.tHead?.textContent||'').includes('Código / número')&&
      (t.tHead?.textContent||'').includes('Bloque'));
    if(!table)return;
    const rows=[...table.tBodies[0]?.rows||[]];
    const matching=[];
    for(const row of rows){
      const id=row.querySelector('[data-action="view-lot"]')?.dataset.id;
      const lot=id?getLot(id):null;
      const keep=!!lot&&stageMatches(lot)&&solarMatches(lot);
      row.hidden=!keep;
      row.style.display=keep?'':'none';
      if(keep)matching.push(id);
    }
    const title=table.closest('.card')?.querySelector('.panel-table-head h2');
    if(title)title.textContent='Terrenos del inventario ('+matching.length+')';
    const scroll=table.closest('.table-scroll');
    scroll?.querySelector('[data-inventory-location-empty]')?.remove();
    if(matching.length===0&&rows.length>0){
      const notice=document.createElement('p');
      notice.className='empty';
      notice.dataset.inventoryLocationEmpty='true';
      notice.textContent='No hay terrenos con esta combinación de etapa, bloque y solar.';
      scroll?.appendChild(notice);
    }
    const detail=app.querySelector('.page-cols .detail-panel');
    if(selection.stage!=='all'||selection.solar!=='all'){
      if(matching.length===0){
        if(detail)detail.innerHTML='<h3>Ficha del terreno</h3><p class="sm muted">No hay una ficha que coincida con los filtros seleccionados.</p>';
      }else if(!matching.includes(selectedLot)){
        selectedLot=matching[0];
        render(); // Actualizar la ficha; la siguiente renderización ya tiene la selección correcta.
      }
    }
  }

  const priorRender=render;
  render=function(){
    const output=priorRender.apply(this,arguments);
    if(page==='lots')apply();
    return output;
  };

  document.addEventListener('change',event=>{
    const id=event.target?.id;
    if(id==='inventory-block'){
      // El controlador original actualiza inventoryBlockFilter y renderiza la vista.
      selection.solar='all';
    }else if(id==='inventory-stage'){
      selection.stage=event.target.value;
      selection.solar='all';
      inventoryBlockFilter='all';
      render();
    }else if(id==='inventory-solar'){
      selection.solar=event.target.value;
      render();
    }
  },true);
  document.addEventListener('click',event=>{
    if(!event.target.closest?.('#inventory-location-clear'))return;
    selection.stage='all';
    selection.solar='all';
    inventoryBlockFilter='all';
    render();
  });
})();
