// Integración visual NO catastral del croquis oficial sobre Leaflet.
// No se generan nuevos lotes, no se alteran geometrias GPS manuales ni datos de cobro.
let gpsPlanDraft=null, gpsPlanLayer=null, gpsPlanMarkerLayer=null;
function gpsPlanSource(r){
 // Mantener el identificador original de la alineación GPS ya guardada.
 return [r.officialPlan?.sha256||r.pdf?.sha256||r.pdf?.name||r.builtin||'croquis',mapFeatures(r).length].join(':');
}
function gpsPlanSaved(){
 const r=residence(),a=r.geoConfig?.planAlignment;
 return a&&a.source===gpsPlanSource(r)&&Array.isArray(a.anchors)&&a.anchors.length===3?a:null;
}
function gpsPlanWorking(){
 return gpsPlanDraft?.residenceId===residence().id?gpsPlanDraft:null;
}
function gpsPlanSvg(){
 const fs=mapFeatures(residence()).filter(f=>Array.isArray(f.points)&&f.points.length>=3);
 const view=residence().viewBox||[110,35,435,510];
 const vb=view.map(Number);
 if(vb.length!==4||vb.some(v=>!Number.isFinite(v))||vb[2]<=0||vb[3]<=0)return '';
 const marks=(gpsPlanWorking()?.anchors||[]).map((a,i)=>'<circle cx="'+a.plan[0]+'" cy="'+a.plan[1]+'" r="5" fill="#f97316" stroke="#fff" stroke-width="1.5"/><text x="'+(a.plan[0]+6)+'" y="'+(a.plan[1]-5)+'" font-size="10" font-weight="bold">'+(i+1)+'</text>').join('');
 return '<svg id="gps-plan-source" xmlns="http://www.w3.org/2000/svg" viewBox="'+vb.join(' ')+'" preserveAspectRatio="xMidYMid meet" style="width:100%;height:360px;max-height:55vh;background:#e6efe1;touch-action:manipulation;cursor:crosshair;border:1px solid #c8d9c7;border-radius:12px" role="img" aria-label="Selecciona tres esquinas identificables del croquis">'+fs.map(f=>'<polygon points="'+f.points.map(p=>p.join(',')).join(' ')+'" fill="#b3d4a9" fill-opacity=".6" stroke="#718f82" stroke-width=".7"/>').join('')+marks+'</svg>';
}
function gpsPlanControls(){
 const fs=mapFeatures(residence());
 if(!fs.length)return '';
 const draft=gpsPlanWorking(),saved=gpsPlanSaved(),ready=draft?.anchors.length===3;
 const btn='<button type="button" class="btn btn-primary" data-gps-plan="start">'+(saved?'Recalibrar croquis':'Alinear croquis con satélite')+'</button>';
 const toggle=saved?'<button type="button" class="btn btn-outline" data-gps-plan="toggle">'+(saved.visible===false?'Mostrar croquis':'Ocultar croquis')+'</button>':'';
 const status=draft?(ready?'3 referencias completas. Comprueba el resultado sobre el satélite y confirma.':draft.pending?'Ahora toca en el satélite la MISMA esquina del croquis.':'Paso '+(draft.anchors.length+1)+'/3: toca una esquina identificable en el croquis y luego la misma ubicación en el satélite.'):(saved?'Croquis alineado visualmente con '+saved.anchors.length+' referencias. Sigue siendo aproximado.':'Para ver los solares del croquis en el satélite debes alinear tres puntos coincidentes. No se modificarán los propietarios ni los pagos.');
 return '<section class="card" style="padding:16px;margin-bottom:16px;border:1px solid #d8e9dc" id="gps-plan-panel"><h3 style="margin:0 0 7px">Croquis de '+esc(residence().name)+' sobre GPS</h3><p class="sm muted">Visualización aproximada de '+fs.length+' polígonos del mapa de solares. Los bloques y etapas se toman del inventario, no de la fotografía. No es un levantamiento catastral.</p><div style="display:flex;flex-wrap:wrap;gap:8px;margin:12px 0">'+btn+toggle+(draft?'<button type="button" class="btn btn-outline" data-gps-plan="cancel">Cancelar</button><button type="button" class="btn btn-primary" data-gps-plan="save" id="gps-plan-save" '+(ready?'':'hidden')+'>Guardar alineación</button>':'')+'</div><p class="sm" role="status" id="gps-plan-step" style="font-weight:700">'+esc(status)+'</p>'+(draft?'<p class="sm muted">Utiliza tres esquinas separadas entre sí: por ejemplo, una cerca de la entrada, otra en la parte superior y una en el extremo derecho del plano.</p>'+gpsPlanSvg():'')+'</section>';
}
const originalGpsPlanPage=gpsPage;
gpsPage=function(){
 const h=originalGpsPlanPage();
 const saved=gpsPlanSaved(),draft=gpsPlanWorking();
 const visible=!!(draft?.anchors.length===3||saved&&saved.visible!==false&&!draft);
 const count=visible?mapFeatures(residence()).filter(f=>Array.isArray(f.points)&&f.points.length>=3).length:0;
 return h.replace(/(\d+) polígonos visibles/g,(_,n)=>n+' GPS manuales · '+count+' del croquis').replace('<div class="geo-layout">',gpsPlanControls()+'<div class="geo-layout">');
};
function gpsPlanShow(){
 if(!geoMap||page!=='gps'||!window.L)return;
 if(gpsPlanLayer){try{gpsPlanLayer.remove()}catch(e){}gpsPlanLayer=null;}
 const draft=gpsPlanWorking(),saved=gpsPlanSaved();
 const anchors=draft?.anchors.length===3?draft.anchors:(!draft&&saved?.visible!==false?saved?.anchors:null);
 if(!anchors){return;}
 let mapped;
 try{mapped=planAffineFeatures(mapFeatures(residence()),anchors);}
 catch(error){const el=document.getElementById('gps-plan-step');if(el)el.textContent=error.message;return;}
 gpsPlanLayer=L.layerGroup().addTo(geoMap);
 const r=residence();
 let displayed=0;
 for(const {feature:f,geo} of mapped){
  const rec=r.records?.[f.key]||{};
  // Compartir reglas con el mapa de solares, incluido verde limón y prima registrada.
  const planRecord=arrayanRecord(f);
  const lot=planRecord.lot||(rec.lotId&&getLot(rec.lotId))||db.lots.find(l=>l.residenceId===r.id&&l.sourceFeatureKey===f.key);
  if(lot?.geo?.length>=3)continue; // Un perímetro medido manualmente tiene prioridad.
  const status=planRecord.lot?planRecord.status:lot?mapVisualStatus(lot):planRecord.status||f.initial||'available';
  const color=planRecord.lot?(arrayanColors[status]||geoStatusColor(lot)):lot?geoStatusColor(lot):(arrayanColors[status]||'#f4cd71');
  const p=L.polygon(geo,{color:'#234d44',weight:1,fillColor:color,fillOpacity:.48,opacity:.7});
  const title='Etapa '+esc(f.stage||lot?.stage||'sin definir')+' · Bloque '+esc(rec.block||lot?.block||f.block||'?')+' · '+(f.type==='commercial'?'Local':'Solar')+' '+esc(f.number||lot?.sourceNumber||'?');
  const ownerSale=lot&&db.sales.find(s=>s.lotId===lot.id),owner=ownerSale&&getClient(ownerSale.clientId);
  p.bindPopup('<div class="geo-popup"><strong>'+title+'</strong><p style="margin:8px 0">Estado: '+esc(status==='prima-paid'?'💚 Prima registrada':status==='contracted'?'Contrato registrado (sin prima)':status)+'</p><p style="margin:8px 0">Medida: '+(lot?.area>0?esc(String(lot.area))+' m²':'pendiente de verificar')+'</p>'+(owner?'<p style="margin:8px 0">Cliente: '+esc(owner.name)+'</p>':'')+(lot?'<button class="btn btn-primary btn-sm" data-action="view-lot" data-id="'+esc(lot.id)+'">Abrir ficha del solar</button>':'<p class="sm">Ficha pendiente de vinculación</p>')+'<p class="sm muted">Posición GPS aproximada por alineación visual.</p></div>');
  p.bindTooltip(title,{sticky:true,direction:'top'});p.addTo(gpsPlanLayer);displayed++;
 }
 if(displayed)document.getElementById('geo-empty-overlay')?.remove();
 const s=document.querySelector('#gps-plan-panel > p.sm.muted');
 if(s)s.textContent='Croquis superpuesto: '+displayed+' solares sin perímetro GPS propio. Los originales de los solares, contratos y pagos permanecen intactos. Alineación visual, no catastral.';
}
const originalGpsRenderPolygons=geoRenderPolygons;
geoRenderPolygons=function(){originalGpsRenderPolygons();gpsPlanShow();};
function gpsPlanMapClick(event){
 const w=gpsPlanWorking();
 if(!w?.pending||w.anchors.length>=3)return;
 w.anchors.push({plan:w.pending,gps:[event.latlng.lat,event.latlng.lng]});w.pending=null;
 if(gpsPlanMarkerLayer)L.circleMarker(event.latlng,{radius:5,color:'#f97316',fillOpacity:1,interactive:false}).addTo(gpsPlanMarkerLayer);
 const status=document.getElementById('gps-plan-step');
 if(w.anchors.length===3){
  try{planAffineFeatures(mapFeatures(residence()),w.anchors);}
  catch(error){w.anchors.pop();if(status)status.textContent=error.message+' Repite el tercer punto.';return;}
  if(status)status.textContent='Tres puntos elegidos. Revisa que los solares coincidan con las calles del satélite antes de guardar.';
  const saveBtn=document.getElementById('gps-plan-save');if(saveBtn)saveBtn.hidden=false;
  gpsPlanShow();
 }else if(status)status.textContent='Referencia '+w.anchors.length+'/3 registrada. Selecciona otra esquina alejada en el croquis.';
}
const originalGpsPlanInit=initGeoMap;
initGeoMap=function(){
 originalGpsPlanInit();
 if(geoMap&&page==='gps'){
  gpsPlanMarkerLayer=L.layerGroup().addTo(geoMap);
  geoMap.on('click',gpsPlanMapClick);
 }
};
document.addEventListener('click',event=>{
 const action=event.target.closest?.('[data-gps-plan]')?.dataset.gpsPlan;
 if(action){
  event.preventDefault();
  if(page!=='gps')return;
  if(action==='start'){
   gpsPlanDraft={residenceId:residence().id,anchors:[],pending:null};render();return;
  }
  if(action==='cancel'){gpsPlanDraft=null;render();return;}
  if(action==='toggle'){
   const cfg=gpsPlanSaved();if(!cfg)return;
   cfg.visible=cfg.visible===false;save();render();return;
  }
  if(action==='save'){
   const d=gpsPlanWorking();if(!d||d.anchors.length!==3)return;
   try{planAffineFeatures(mapFeatures(residence()),d.anchors);}
   catch(error){toast(error.message,'error');return;}
   const cfg=geoSetup();const view=geoMap?.getCenter();if(view){cfg.center=[view.lat,view.lng];cfg.zoom=geoMap.getZoom();cfg.homeSet=true;cfg.layer='satellite';}
   cfg.planAlignment={anchors:d.anchors,source:gpsPlanSource(residence()),visible:true,approximate:true,confirmedAt:new Date().toISOString()};
   save();gpsPlanDraft=null;render();toast('Croquis alineado sobre satélite. Coordenadas aproximadas, no catastrales.');return;
  }
 }
 const svg=event.target.closest?.('#gps-plan-source');
 const d=gpsPlanWorking();
 if(!svg||!d||d.pending||d.anchors.length>=3)return;
 const matrix=svg.getScreenCTM();
 if(!matrix)return;
 const point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;
 const p=point.matrixTransform(matrix.inverse());
 const vb=svg.viewBox.baseVal;
 if(p.x<vb.x||p.y<vb.y||p.x>vb.x+vb.width||p.y>vb.y+vb.height)return;
 d.pending=[+p.x.toFixed(3),+p.y.toFixed(3)];
 const mark=document.createElementNS('http://www.w3.org/2000/svg','circle');
 mark.setAttribute('cx',d.pending[0]);mark.setAttribute('cy',d.pending[1]);mark.setAttribute('r','5');mark.setAttribute('fill','#f97316');mark.setAttribute('stroke','#fff');svg.appendChild(mark);
 const status=document.getElementById('gps-plan-step');
 if(status)status.textContent='Punto del croquis seleccionado. Toca esa misma esquina en el MAPA SATELITAL.';
});
