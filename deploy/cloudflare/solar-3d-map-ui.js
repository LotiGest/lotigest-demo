// LOTIGEST · Vista 3D decorativa del mapa catastral.
// Los polígonos, referencias, clientes, estados y operaciones siguen siendo los originales.
// No guarda información en Cloudflare ni reemplaza los trazados del PDF.
(function(){
 'use strict';
 const modeKey='lotigest-map-mode-3d-v1';
 let view='3d', yaw=-6;
 try {if(localStorage.getItem(modeKey)==='2d')view='2d';}catch(_){}
 const previousPage=arrayanPage;
 arrayanPage=function(...args){
  const html=previousPage(...args);
  if(typeof html!=='string'||!html.includes('id="arrayan-scroll"'))return html;
  const bar='<div class="lg-map-visual-toolbar" role="group" aria-label="Visualización del plano">'+
   '<strong>Visualización del mapa</strong>'+
   '<button type="button" class="btn btn-outline" data-lg-map-view="2d" aria-pressed="'+(view==='2d')+'">▤ Vista 2D</button>'+
   '<button type="button" class="btn btn-primary" data-lg-map-view="3d" aria-pressed="'+(view==='3d')+'">◈ Vista 3D</button>'+
   '<button type="button" class="btn btn-outline" data-lg-map-turn="-1" title="Girar a la izquierda">↶ Girar</button>'+
   '<button type="button" class="btn btn-outline" data-lg-map-turn="1" title="Girar a la derecha">Girar ↷</button>'+
   '<small>Relieve ilustrativo sobre los solares originales del plano; no representa alturas ni coordenadas topográficas.</small></div>';
  return html.replace('<div class="page-cols">',bar+'<div class="page-cols">');
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
 function apply(){
  const viewport=document.getElementById('arrayan-scroll');
  if(!viewport)return;
  const svg=viewport.querySelector('#arrayan-native');
  if(!svg)return;
  addSolarRelief(svg);
  viewport.classList.toggle('lg-3d-mode',view==='3d');
  viewport.style.setProperty('--lg-map-yaw',yaw+'deg');
  for(const btn of document.querySelectorAll('[data-lg-map-view]')){
   const selected=btn.getAttribute('data-lg-map-view')===view;
   btn.setAttribute('aria-pressed',String(selected));
   btn.classList.toggle('lg-map-view-active',selected);
  }
  for(const btn of document.querySelectorAll('[data-lg-map-turn]'))btn.disabled=view!=='3d';
 }
 const previousRender=render;
 render=function(...args){const result=previousRender(...args);apply();return result;};
 document.addEventListener('click',function(event){
  const modeBtn=event.target.closest?.('[data-lg-map-view]');
  const turnBtn=event.target.closest?.('[data-lg-map-turn]');
  if(!modeBtn&&!turnBtn)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(modeBtn){
   view=modeBtn.getAttribute('data-lg-map-view')==='2d'?'2d':'3d';
   try{localStorage.setItem(modeKey,view)}catch(_){}
  } else if(view==='3d'){
   yaw=Math.max(-18,Math.min(18,yaw+Number(turnBtn.getAttribute('data-lg-map-turn'))*6));
  }
  apply();
 },true);
 if(!document.getElementById('lotigest-map-3d-css')){
  const style=document.createElement('style');style.id='lotigest-map-3d-css';
  style.textContent=[
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
   '@media print{#arrayan-scroll #arrayan-native{transform:none!important;filter:none!important}.lg-map-visual-toolbar{display:none!important}}'
  ].join('\n');
  document.head.appendChild(style);
 }
})();
