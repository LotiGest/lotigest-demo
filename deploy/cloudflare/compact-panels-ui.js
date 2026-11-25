// Presentación compacta global. No modifica datos, eventos de negocio ni mapas.
(function installCompactPanels(){
 const openState=new Map();
 const mapPages=new Set(['arrayan','gps','design','map','mapa','solar-map']);
 const tidy=s=>(s||'').replace(/\s+/g,' ').trim();
 const safeMap=node=>node.matches('.leaflet-container, [data-map], .map-container, .map-panel, .geo-map, .map-canvas')||!!node.querySelector('.leaflet-container, [data-map], #geoMap, #geo-map, #gps-map, #map, canvas, .map-svg, svg.map-svg, .solar-map, .map-container, .map-panel, .geo-map, .map-canvas, [data-solar-map]')||/mapa|croquis|plano|gps/i.test(tidy(node.querySelector('h2,h3')?.textContent));
 function fold(node,title,key,initial=false){
  if(!node||!node.parentElement||node.closest('details')||node.matches('details')||safeMap(node))return;
  const details=document.createElement('details'),summary=document.createElement('summary');
  details.className='lg-panel-fold';details.dataset.foldKey=key;
  summary.textContent=title;details.append(summary);
  details.open=openState.has(key)?openState.get(key):initial;
  node.before(details);details.append(node);
  details.addEventListener('toggle',()=>{if(details.isConnected)openState.set(key,details.open);});
 }
 function compact(){
  const root=document.querySelector('.workspace-inner');
  if(!root||typeof page==='undefined'||mapPages.has(page)||root.dataset.compactReady)return;
  root.dataset.compactReady='true';
  const prefix=page+':';
  for(const head of root.querySelectorAll('.page-head')){
   const desc=head.querySelector(':scope > div:first-child > p');
   if(desc&&page!=='help'){desc.hidden=true;desc.style.display='none';}
   const actions=head.querySelector('.head-actions');
   if(actions&&actions.querySelectorAll('button,a').length>1)fold(actions,'Acciones y reportes',prefix+'actions');
  }
  const note=root.querySelector('[data-contract-collection-source]');
  if(note){
   const p=note.querySelector('p');if(p)p.textContent='Solo clientes y solares vinculados a contratos.';
   fold(note,'Clientes y solares desde Contratos',prefix+'contracts');
  }
  const used=new Set();
  for(const node of root.querySelectorAll('.cards-four,.fn-kpis,.report-metric')){
   const group=node.matches('.report-metric')?node.parentElement:node;
   if(used.has(group)||group.closest('details'))continue;used.add(group);
   fold(group,group.classList.contains('money-row')?'Resumen financiero':'Resumen de indicadores',prefix+'metrics'+used.size);
  }
  const filterGroups=new Set();
  for(const input of root.querySelectorAll('#debt-month,#debt-residence,#debt-filter,#debt-overdue-months,#inventory-status,#inventory-kind,#inventory-block,[data-fn-scope]')){
   const group=input.closest('.card,.fn-scope');
   if(group&&!group.querySelector('table')&&!filterGroups.has(group)){
    filterGroups.add(group);fold(group,'Filtros y orden',prefix+'filters'+filterGroups.size);
   }
  }
  // Los buscadores siguen abiertos. No esconder avisos de seguridad, errores ni formularios de pago.
  const cards=[...root.querySelectorAll('.card,.settings-card')].filter(node=>!node.parentElement?.closest('.card,.settings-card'));
  let index=0;
  for(const node of cards){
   if(node.closest('details')||node.matches('[data-name-id-widget],.notice-card,.empty,.stat-card,.fn-kpi')||node.querySelector('[data-name-id-search],#geoMap,#geo-map,[data-residence-picker],[role="alert"]')||safeMap(node))continue;
   const heading=node.querySelector('h2,h3,h4,.card-title');
   const title=tidy(heading?.textContent);
   if(!title||title.length>100)continue;
   const primary=!!node.querySelector('table')||page==='collections'&&node.tagName==='SECTION'&&node.querySelector('article');
   // Las listas se mantienen abiertas al entrar; los detalles se abren cuando se necesitan.
   fold(node,title,prefix+'section:'+title+':'+(++index),primary);
  }
  if(page==='collections'){
   for(const p of root.querySelectorAll(':scope > p.muted.sm')){
    if(p.textContent.startsWith('Los meses vencidos'))p.textContent='Mora calculada al día de hoy.';
    if(p.textContent.startsWith('Los cuadros muestran'))p.hidden=true;
   }
  }
 }
 const base=render;
 render=function(...args){const result=base.apply(this,args);compact();return result;};
 compact();
})();
