// LOTIGEST · Vista 3D decorativa del mapa catastral.
// Los polígonos, referencias, clientes, estados y operaciones siguen siendo los originales.
// No guarda información en Cloudflare ni reemplaza los trazados del PDF.
(function(){
 'use strict';
 const modeKey='lotigest-map-mode-3d-v2';
 let view='project', yaw=-6;
 // La navegación de detalle es una presentación local, no modifica el inventario.
 let scopeStage='', scopeBlock='', scopeResidence='';
 const originalBoxes=new WeakMap();
 function scopeFeatures(){
  if(typeof residence!=='function'||typeof mapFeatures!=='function')return [];
  const current=residence();
  if(scopeResidence!==current.id){scopeResidence=current.id;scopeStage='';scopeBlock='';}
  return mapFeatures(current);
 }
 function stageOf(f){return String(f.stage??'');}
 function blockOf(f){return String((typeof residenceRecords==='function'?residenceRecords()[f.key]?.block:'')||f.block||'');}
 function scopeEscape(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
 function options(values,current,empty,format){
  return '<option value="">'+empty+'</option>'+values.map(v=>'<option value="'+scopeEscape(v)+'"'+(v===current?' selected':'')+'>'+scopeEscape(format(v))+'</option>').join('');
 }
 function scopeToolbar(){
  const features=scopeFeatures();
  if(!features.length)return '';
  const sort=(a,b)=>a.localeCompare(b,'es',{numeric:true});
  const stages=[...new Set(features.map(stageOf).filter(Boolean))].sort(sort);
  const stageFeatures=features.filter(f=>!scopeStage||stageOf(f)===scopeStage);
  const blocks=[...new Set(stageFeatures.map(blockOf).filter(Boolean))].sort(sort);
  const count=stageFeatures.filter(f=>!scopeBlock||blockOf(f)===scopeBlock).length;
  return '<div class="lg-map-scope" role="group" aria-label="Mapa completo y navegación por sectores">'+
   '<button type="button" class="btn btn-primary" data-lg-map-full aria-pressed="'+(!scopeStage&&!scopeBlock)+'">Mapa completo</button>'+
   '<details '+(scopeStage||scopeBlock?'open':'')+'><summary>Ver por etapa o bloque</summary><div class="lg-map-scope-fields">'+
   '<label>Etapa<select id="lg-map-stage">'+options(stages,scopeStage,'Todas las etapas',v=>'Etapa '+v)+'</select></label>'+
   '<label>Bloque<select id="lg-map-block">'+options(blocks,scopeBlock,'Todos los bloques',v=>/^bloque/i.test(v)?v:'Bloque '+v)+'</select></label>'+
   '<span aria-live="polite">'+count+' terrenos en esta vista</span></div></details></div>';
 }
 function scopedBounds(features){
  const p=features.flatMap(f=>Array.isArray(f.points)?f.points:[]).filter(x=>Array.isArray(x)&&x.length>=2&&Number.isFinite(Number(x[0]))&&Number.isFinite(Number(x[1])));
  if(!p.length)return null;
  const xs=p.map(x=>Number(x[0])),ys=p.map(x=>Number(x[1]));
  const x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y;
  const pad=Math.max(5,Math.max(w,h)*.075);
  return [x-pad,y-pad,w+2*pad,h+2*pad].join(' ');
 }
 function applyScope(svg){
  if(!originalBoxes.has(svg))originalBoxes.set(svg,svg.getAttribute('viewBox'));
  const original=originalBoxes.get(svg);
  const all=scopeFeatures(),active=Boolean(scopeStage||scopeBlock);
  const subset=active?all.filter(f=>(!scopeStage||stageOf(f)===scopeStage)&&(!scopeBlock||blockOf(f)===scopeBlock)):all;
  const bounds=active?scopedBounds(subset):null;
  svg.closest('#arrayan-scroll')?.classList.toggle('lg-scope-fit',Boolean(bounds));
  if(bounds){svg.setAttribute('viewBox',bounds);svg.setAttribute('preserveAspectRatio','xMidYMid meet');}
  else if(original!==null)svg.setAttribute('viewBox',original);
  const keys=new Set(subset.map(f=>String(f.key)));
  for(const plot of svg.querySelectorAll('.ar-solar'))plot.classList.toggle('lg-outside-scope',Boolean(bounds)&&!keys.has(plot.dataset.id));
  for(const label of svg.querySelectorAll('[data-lg-measure-key]'))label.classList.toggle('lg-outside-scope',Boolean(bounds)&&!keys.has(label.dataset.lgMeasureKey));
  for(const label of svg.querySelectorAll('.ar-block-label'))label.classList.toggle('lg-outside-scope',Boolean(bounds)&&Boolean(scopeBlock)&&label.getAttribute('aria-label')?.toUpperCase()!==('BLOQUE '+scopeBlock.replace(/^bloque\s+/i,'')).toUpperCase()&&label.getAttribute('aria-label')?.toUpperCase()!==scopeBlock.toUpperCase());
 }
 function resetLegacyMapFilters(){
  if(typeof arrayanStageFilter!=='undefined')arrayanStageFilter='all';
  if(typeof arrayanBlockFilter!=='undefined')arrayanBlockFilter='all';
  if(typeof arrayanKindFilter!=='undefined')arrayanKindFilter='all';
  if(typeof arrayanFilter!=='undefined')arrayanFilter='all';
  if(typeof arrayanSelected!=='undefined')arrayanSelected=null;
  if(typeof arrayanZoom!=='undefined')arrayanZoom=100;
 }
 function switchScope(stage,block,full=false){
  scopeStage=stage;scopeBlock=block;resetLegacyMapFilters();
  if(!full&&view==='project')view='3d';
  try{localStorage.setItem(modeKey,view);}catch(_){}
  render();
  const viewport=document.getElementById('arrayan-scroll');
  if(viewport){viewport.scrollLeft=0;viewport.scrollTop=0;if(!full&&(stage||block))viewport.scrollIntoView?.({block:'center',inline:'nearest',behavior:'auto'});}
 }
 try {const saved=localStorage.getItem(modeKey);if(['2d','3d','project'].includes(saved))view=saved;}catch(_){}
 function projectAllowed(){return typeof residence!=='function'||residence().id==='arrayan';}
 const previousPage=arrayanPage;
 arrayanPage=function(...args){
  const html=previousPage(...args);
  if(typeof html!=='string'||!html.includes('id="arrayan-scroll"'))return html;
  const bar='<div class="lg-map-visual-toolbar" role="group" aria-label="Visualización del plano">'+
   '<strong>Visualización del mapa</strong>'+
   (projectAllowed()?'<button type="button" class="btn btn-outline" data-lg-map-view="project" aria-pressed="'+(view==='project')+'">Vista del proyecto</button>':'')+
   '<button type="button" class="btn btn-outline" data-lg-map-view="2d" aria-pressed="'+(view==='2d')+'">▤ Vista 2D</button>'+
   '<button type="button" class="btn btn-primary" data-lg-map-view="3d" aria-pressed="'+(view==='3d')+'">◈ Vista 3D</button>'+
   '<button type="button" class="btn btn-outline" data-lg-map-turn="-1" title="Girar a la izquierda">↶ Girar</button>'+
   '<button type="button" class="btn btn-outline" data-lg-map-turn="1" title="Girar a la derecha">Girar ↷</button>'+
   '<small>Casas simbólicas: techos verdes = vendidos / prima; amarillos = disponibles; rojos = mora; morados = apartados; gris = privado; verde limón = contrato sin prima. Relieve y alineación ilustrativos.</small></div>';
  const illustration=!projectAllowed()?'':'<figure class="lg-map-project"><img src="/altos-arrayan-vista-proyecto.webp" width="1536" height="1024" alt="Propuesta visual de Altos del Arrayán con casas y terrazas sobre imagen satelital" decoding="async"><figcaption>Vista ilustrativa del proyecto · casas, colores y alturas de referencia. Para consultar estados actuales y seleccionar terrenos, abre Vista 2D o Vista 3D.<br><span>Punto de referencia: 14.4279541, -88.9510169 · alineación aproximada.</span><button type="button" class="btn btn-primary" data-lg-map-view="3d">Seleccionar un solar</button></figcaption></figure>';
  return html.replace('<div class="page-cols">',bar+scopeToolbar()+'<div class="page-cols">').replace(/(<div[^>]*id="arrayan-scroll"[^>]*>)/,'$1'+illustration);
 };
 const ns='http://www.w3.org/2000/svg';
 function darken(hex){
  const m=/^#([0-9a-f]{6})$/i.exec(String(hex||''));
  if(!m)return '#48635a';
  const raw=m[1],ch=n=>Math.round(parseInt(raw.slice(n,n+2),16)*.61).toString(16).padStart(2,'0');
  return '#'+ch(0)+ch(2)+ch(4);
 }
 function addSolarRelief(svg){
  if(svg.dataset.lgDepthPrepared==='1')return;
  svg.dataset.lgDepthPrepared='1';
  for(const plot of svg.querySelectorAll('.ar-solar')){
   const original=plot.querySelector('polygon:not(.lg-solar-depth)');
   if(!original)continue;
   const values=String(original.getAttribute('points')||'').trim().split(/\s+/).map(x=>x.split(',').map(Number));
   if(values.length<3||values.some(p=>p.length!==2||!p.every(Number.isFinite)))continue;
   const depth=2.35,shade=darken(original.getAttribute('fill'));
   const base=original.cloneNode(false);
   base.classList.add('lg-solar-depth');
   base.setAttribute('points',values.map(p=>p[0]+','+(p[1]+depth)).join(' '));
   base.setAttribute('fill',shade);base.setAttribute('stroke','none');
   base.setAttribute('pointer-events','none');base.setAttribute('aria-hidden','true');
   const sides=document.createElementNS(ns,'path');
   let d='';
   for(let i=0;i<values.length;i++){
    const a=values[i],b=values[(i+1)%values.length];
    d+='M'+a[0]+' '+a[1]+'L'+b[0]+' '+b[1]+'L'+b[0]+' '+(b[1]+depth)+'L'+a[0]+' '+(a[1]+depth)+'Z';
   }
   sides.setAttribute('d',d);sides.setAttribute('fill',shade);
   sides.setAttribute('stroke','none');sides.setAttribute('pointer-events','none');
   sides.setAttribute('aria-hidden','true');sides.classList.add('lg-solar-depth');
   plot.insertBefore(base,original);plot.insertBefore(sides,original);
  }
 }
 function node(tag,attrs){const el=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));return el;}
 function roofColor(plot){
  let status;try{const f=residenceFeatures().find(f=>f.key===plot.dataset.id);if(f)status=arrayanRecord(f).status;}catch(_){}
  const palette={unregistered:'#171717',available:'#efc94c',sold:'#268d54',debt:'#d7474b',reserved:'#9660c5',private:'#9aa6aa',contracted:'#a3e635','prima-paid':'#16a34a'};
  return {status:status||'reference',color:palette[status]||plot.querySelector('polygon:not(.lg-solar-depth)')?.getAttribute('fill')||'#efc94c'};
 }
 function addHouses(svg){
  for(const plot of svg.querySelectorAll('.ar-solar')){
   const original=plot.querySelector('polygon:not(.lg-solar-depth)');if(!original)continue;
   const roof=roofColor(plot),existing=plot.querySelector('.lg-map-house');
   if(existing){existing.dataset.state=roof.status;existing.querySelectorAll('[data-roof]').forEach(p=>p.setAttribute('fill',roof.color));continue;}
   const values=original.getAttribute('points').trim().split(/\s+/).map(p=>p.split(',').map(Number));
   const text=plot.querySelector('text');
   const x=Number(text?.getAttribute('x'))||values.reduce((a,p)=>a+p[0],0)/values.length;
   const y=(Number(text?.getAttribute('y'))||values.reduce((a,p)=>a+p[1],0)/values.length)-2;
   const id='house-clip-'+String(plot.dataset.id||'').replace(/[^a-z0-9-]/gi,'');
   const clip=node('clipPath',{id});clip.appendChild(node('path',{d:'M'+values.map(p=>p.join(' ')).join('L')+'Z'}));plot.appendChild(clip);
   const group=node('g',{'class':'lg-map-house','clip-path':'url(#'+id+')','pointer-events':'none','aria-hidden':'true','data-state':roof.status});
   const body=node('g',{transform:'translate('+x+' '+y+')'});
   body.appendChild(node('path',{d:'M-2 -.5L0 -1.5L2 -.5L2 1.3L0 2.2L-2 1.3Z',fill:'#f9faf3',stroke:'#526b5b','stroke-width':.14}));
   body.appendChild(node('path',{d:'M0 .4L2 -.5L2 1.3L0 2.2Z',fill:'#c9d8c5'}));
   body.appendChild(node('path',{d:'M-2.45 -.65L0 -2.2L2.45 -.65L0 .8Z',fill:roof.color,'data-roof':'true',stroke:'#f8fff5','stroke-width':.18}));
   body.appendChild(node('path',{d:'M0 -2.2L0 .8',fill:'none',stroke:'#2c5d3e','stroke-width':.12}));
   body.appendChild(node('path',{d:'M-.6 1.1L0 .8L0 2.2L-.6 1.9Z',fill:'#52685a'}));
   // Vegetación simbólica en la vista 3D, recortada al solar; no representa árboles levantados por GPS.
   const tree=node('g',{'class':'lg-map-tree',transform:'translate(2.9 .6)','aria-hidden':'true'});
   tree.appendChild(node('path',{d:'M0 .2V1.6',stroke:'#846747','stroke-width':.35}));
   tree.appendChild(node('circle',{cx:0,cy:-.35,r:1.05,fill:'#37774a',stroke:'#28573a','stroke-width':.12}));
   tree.appendChild(node('circle',{cx:-.3,cy:-.65,r:.57,fill:'#82b26a'}));
   body.appendChild(tree);
   group.appendChild(body);plot.insertBefore(group,text||null);
  }
 }
 function addTerraces(svg){
  if(svg.querySelector('.lg-map-terraces'))return;
  const g=node('g',{'class':'lg-map-terraces','pointer-events':'none','aria-hidden':'true'});
  g.appendChild(node('path',{d:'M304 343L314 340L385 488L377 489L304 358L308 347Z',fill:'#b7cba6',stroke:'#8f9e78','stroke-width':.3}));
  for(const [x,y] of [[312,357],[326,382],[341,410],[356,438],[372,466]]){
   g.appendChild(node('path',{d:'M'+x+' '+y+'l9 -4l4 8l-9 4Z',fill:'#b6a186',stroke:'#e6d8b9','stroke-width':.6}));
   const stairs=node('g',{transform:'translate('+x+' '+y+') rotate(-30)'});
   stairs.appendChild(node('path',{d:'M1 -1H4V7H1Z',fill:'#e7e6d8',stroke:'#818974','stroke-width':.16}));
   for(let i=0;i<7;i++)stairs.appendChild(node('path',{d:'M1 '+i+'H4',stroke:'#8e9783','stroke-width':.18}));
   g.appendChild(stairs);
  }
  svg.insertBefore(g,svg.firstChild);
 }
 function apply(){
  const viewport=document.getElementById('arrayan-scroll');
  if(!viewport)return;
  const svg=viewport.querySelector('#arrayan-native');
  if(!svg)return;
  addSolarRelief(svg);if(projectAllowed())addTerraces(svg);addHouses(svg);applyScope(svg);
  const activeView=view==='project'&&!projectAllowed()?'3d':view;
  viewport.classList.toggle('lg-3d-mode',activeView==='3d');
  viewport.classList.toggle('lg-project-mode',activeView==='project');
  viewport.style.setProperty('--lg-map-yaw',yaw+'deg');
  if(typeof solarTouchSync==='function')solarTouchSync();
  const legacyStage=document.getElementById('ar-stage-filter'),legacyBlock=document.getElementById('ar-block-filter');
  if(scopeStage||scopeBlock){if(legacyStage)legacyStage.value=scopeStage||'all';if(legacyBlock)legacyBlock.value=scopeBlock||'all';}
  for(const btn of document.querySelectorAll('[data-lg-map-view]')){
   const selected=btn.getAttribute('data-lg-map-view')===activeView;
   btn.setAttribute('aria-pressed',String(selected));
   btn.classList.toggle('lg-map-view-active',selected);
  }
  for(const btn of document.querySelectorAll('[data-lg-map-turn]'))btn.disabled=activeView!=='3d';
 }
 const previousRender=render;
 render=function(...args){const result=previousRender(...args);apply();return result;};
 document.addEventListener('click',function(event){
  const fullBtn=event.target.closest?.('[data-lg-map-full], [data-action="arrayan-fit"]');
  if(fullBtn){event.preventDefault();event.stopImmediatePropagation();switchScope('','',true);return;}
  const modeBtn=event.target.closest?.('[data-lg-map-view]');
  const turnBtn=event.target.closest?.('[data-lg-map-turn]');
  if(!modeBtn&&!turnBtn)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(modeBtn){
   const requested=modeBtn.getAttribute('data-lg-map-view');view=['2d','3d','project'].includes(requested)?requested:'3d';
   try{localStorage.setItem(modeKey,view)}catch(_){}
   if(view==='project'&&(scopeStage||scopeBlock)){switchScope('','',true);return;}
  } else if(view==='3d'){
   yaw=(yaw+Number(turnBtn.getAttribute('data-lg-map-turn'))*45)%360;
  }
  apply();
 },true);
 document.addEventListener('change',function(event){
  const id=event.target.id;
  if(id==='lg-map-stage'||id==='lg-map-block'){
   event.stopImmediatePropagation();
   if(id==='lg-map-stage')switchScope(event.target.value,'');
   else switchScope(scopeStage,event.target.value);
  }else if(id==='ar-stage-filter'||id==='ar-block-filter'){
   event.stopImmediatePropagation();
   const value=event.target.value==='all'?'':event.target.value;
   if(id==='ar-stage-filter')switchScope(value,'');
   else switchScope(scopeStage||(typeof arrayanStageFilter!=='undefined'&&arrayanStageFilter!=='all'?arrayanStageFilter:''),value);
  }else if(['ar-kind','ar-filter'].includes(id)){
   scopeStage='';scopeBlock='';
  }
 },true);
 if(!document.getElementById('lotigest-map-3d-css')){
  const style=document.createElement('style');style.id='lotigest-map-3d-css';
  style.textContent=[
   '#arrayan-scroll.lg-scope-fit{height:60vh;height:60dvh;max-height:680px;scroll-margin-top:110px}#arrayan-scroll.lg-scope-fit #arrayan-native{margin-inline:auto}#arrayan-scroll.lg-scope-fit.lg-3d-mode #arrayan-native{transition:none;transform:rotateZ(var(--lg-map-yaw,-6deg)) scale(.98);filter:drop-shadow(1px 8px 5px rgba(26,57,34,.22))}#arrayan-scroll.lg-scope-fit .ar-block-label{opacity:.9}',
   '.lg-map-scope{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;margin:0 0 14px;padding:10px;border:1px solid #b6cda8;border-radius:12px}.lg-map-scope details{flex:1;min-width:190px}.lg-map-scope summary{cursor:pointer;font-weight:600;padding:9px}.lg-map-scope-fields{display:flex;gap:10px;align-items:end;flex-wrap:wrap;padding:8px}.lg-map-scope-fields label{display:grid;gap:4px;flex:1;min-width:135px}.lg-map-scope-fields span{font-size:12px}.lg-outside-scope{display:none!important}#arrayan-scroll:not(.lg-3d-mode) .lg-map-tree{display:none}@media print{.lg-map-scope{display:none!important}}',
   '#arrayan-scroll .lg-map-project{display:none;margin:0}#arrayan-scroll.lg-project-mode .lg-map-project{display:block}#arrayan-scroll.lg-project-mode #arrayan-native{display:none!important}#arrayan-scroll.lg-project-mode{max-height:none!important;padding:0;overflow:hidden;background:#e7efe2}#arrayan-scroll .lg-map-project img{display:block;width:100%;height:auto;min-width:0}#arrayan-scroll .lg-map-project figcaption{padding:14px;color:#264d3d;font:13px/1.5 system-ui;background:#f5faef}#arrayan-scroll .lg-map-project figcaption span{display:block;margin:7px 0}.lg-map-house{pointer-events:none}#arrayan-scroll:not(.lg-3d-mode) .lg-map-terraces{display:none}#arrayan-scroll .lg-map-house [data-roof]{transition:fill .15s ease}',
   '.lg-map-visual-toolbar{display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:12px 15px;margin:0 0 14px;border:1px solid #d4e5d2;background:linear-gradient(120deg,#f4faf0,#e9f5e7);border-radius:16px;color:#173e2f}',
   '.lg-map-visual-toolbar strong{font-size:14px;margin-right:auto}',
   '.lg-map-visual-toolbar small{width:100%;font-size:11px;color:#577465}',
   '.lg-map-visual-toolbar .lg-map-view-active{background:#184e39!important;color:#fff!important;border-color:#184e39!important}',
   '#arrayan-scroll.lg-3d-mode{background:radial-gradient(ellipse at 35% 20%,#e3f0c5 0%,#c7dcb5 52%,#9db998 100%)!important;perspective:1600px;isolation:isolate;border:1px solid #b6cda8;border-radius:18px}',
   '#arrayan-scroll.lg-3d-mode #arrayan-native{transform-origin:center center;transform:perspective(1400px) rotateX(29deg) rotateZ(var(--lg-map-yaw,-6deg)) scale(.94);filter:drop-shadow(1px 19px 12px rgba(26,57,34,.3));transition:transform .3s ease,filter .3s ease;background:transparent!important}',
   '#arrayan-scroll.lg-3d-mode .ar-solar polygon:not(.lg-solar-depth){fill-opacity:.86!important;stroke:#fafff3;stroke-width:.66}',
   '#arrayan-scroll.lg-3d-mode .ar-solar:hover polygon:not(.lg-solar-depth),#arrayan-scroll.lg-3d-mode .ar-solar:focus polygon:not(.lg-solar-depth){stroke:#102e23;stroke-width:1.4;fill-opacity:.98!important}',
   '#arrayan-scroll.lg-3d-mode .ar-solar .lg-solar-depth{fill-opacity:1!important;pointer-events:none}',
   '#arrayan-scroll:not(.lg-3d-mode) .lg-solar-depth{display:none!important}',
   '#arrayan-scroll.lg-3d-mode .ar-solar text{paint-order:stroke fill;stroke:#f9fff2;stroke-width:.22px;stroke-linejoin:round}',
   '@media(max-width:700px){.lg-map-visual-toolbar{gap:7px;padding:10px}.lg-map-visual-toolbar strong{width:100%}.lg-map-visual-toolbar .btn{padding:7px 10px;font-size:12px}#arrayan-scroll.lg-3d-mode #arrayan-native{transform:perspective(1400px) rotateX(18deg) rotateZ(var(--lg-map-yaw,-6deg)) scale(.97)}}',
   '@media(prefers-reduced-motion:reduce){#arrayan-scroll.lg-3d-mode #arrayan-native{transition:none}}',
   '@media print{#arrayan-scroll.lg-project-mode #arrayan-native{display:block!important}.lg-map-project{display:none!important}#arrayan-scroll #arrayan-native{transform:none!important;filter:none!important}.lg-map-visual-toolbar{display:none!important}}'
  ].join('\n');
  document.head.appendChild(style);
 }
})();
