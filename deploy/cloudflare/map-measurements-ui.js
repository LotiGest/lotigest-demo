let mapMeasuresVisible=true;
function mapMeasureFormat(value){return Number(value).toLocaleString('es-HN',{maximumFractionDigits:2})+' m';}
function mapMeasureNeighbor(key){const r=OFFICIAL_MAP_MEASUREMENTS.lots[key];return r?'solar '+r.number+' · bloque '+r.block+' · etapa '+r.stage:'solar colindante';}
function mapMeasuresInfo(lot){
 const edges=lot?.sourceMeasurementEdges;if(!edges?.length)return '';
 return '<section data-official-map-measures><h3>Medidas del plano</h3><div class="table-scroll"><table><thead><tr><th>Lindero</th><th>Medida</th><th>Fuente</th></tr></thead><tbody>'+edges.map(e=>'<tr><td>'+e.edge+'</td><td>'+(e.value==null?'Pendiente de verificar':mapMeasureFormat(e.value))+'</td><td>'+(e.origin==='pdf'?'PDF':e.origin==='shared-boundary'?'Lindero compartido con '+esc(mapMeasureNeighbor(e.sourceFeatureKey)):'Sin cota verificable')+'</td></tr>').join('')+'</tbody></table></div><p class="sm muted">Las medidas completadas proceden del mismo lindero del solar vecino. No se copian dimensiones de terrenos que solo están cerca. Se conservan las medidas manuales y el área registrada.</p></section>';
}
const measuredInventoryBase=inventoryInfo;
inventoryInfo=function(lot){return measuredInventoryBase(lot)+mapMeasuresInfo(lot);};
const measuredDetailsBase=arrayanDetails;
arrayanDetails=function(){const result=measuredDetailsBase(),f=residenceFeatures().find(f=>f.key===arrayanSelected);if(!f)return result;const lot=arrayanRecord(f).lot;return result+mapMeasuresInfo(lot);};
function mapMeasureMarkup(features){
 return '<g data-official-map-measure-labels="true" pointer-events="none">'+features.map(f=>{
  const row=OFFICIAL_MAP_MEASUREMENTS.lots[f.key];if(!row)return '';
  const center=f.label;
  return row.edges.filter(e=>e.value!=null).map(e=>{
   const [a,b]=e.points,mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
   let angle=Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI;if(angle>90)angle-=180;if(angle< -90)angle+=180;
   const dx=center[0]-mid[0],dy=center[1]-mid[1],length=Math.hypot(dx,dy)||1;
   const x=mid[0]+dx/length*.9,y=mid[1]+dy/length*.9;
   return '<text x="'+x.toFixed(3)+'" y="'+y.toFixed(3)+'" transform="rotate('+angle.toFixed(1)+' '+x.toFixed(3)+' '+y.toFixed(3)+')" text-anchor="middle" dominant-baseline="middle" font-size="1.05" font-family="Arial,sans-serif" font-weight="600" fill="'+(e.origin==='shared-boundary'?'#1d4b91':'#12372b')+'" stroke="#fff" stroke-width=".13" paint-order="stroke fill">'+mapMeasureFormat(e.value)+(e.origin==='shared-boundary'?'*':'')+'</text>';
  }).join('');
 }).join('')+'</g>';
}
const measuredSvgBase=arrayanSvg;
arrayanSvg=function(fullMap=false){const svg=measuredSvgBase(fullMap);return mapMeasuresVisible&&residence().builtin==='arrayan'?svg.replace('</svg>',mapMeasureMarkup(residenceFeatures())+'</svg>'):svg;};
const measuredPageBase=arrayanPage;
arrayanPage=function(){return measuredPageBase().replace('<button class="btn btn-outline" data-action="arrayan-fit">','<button type="button" class="btn btn-outline" data-action="map-measures-toggle">'+(mapMeasuresVisible?'Ocultar medidas':'Mostrar medidas')+'</button><button class="btn btn-outline" data-action="arrayan-fit">');};
const measuredActionBase=handlerAction;
handlerAction=function(action,el){if(action==='map-measures-toggle'){mapMeasuresVisible=!mapMeasuresVisible;render();return;}return measuredActionBase(action,el);};
