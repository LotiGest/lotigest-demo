export const DEFAULT_VARA_M2=0.6972;
export const VARA_SOURCE='https://portalunico.iaip.gob.hn/ver_archivo/MjQwODQzMQ%3D%3D';
export function areaInVaras(areaM2,factor=DEFAULT_VARA_M2){const a=Number(areaM2),f=Number(factor);return Number.isFinite(a)&&a>0&&Number.isFinite(f)&&f>=.5&&f<=1?a/f:null;}
export function applyOfficialPlan(state,manifest){
 if(!manifest||!Array.isArray(manifest.features)||!manifest.features.length||!manifest.sha256||!Array.isArray(manifest.viewBox)||manifest.viewBox.length!==4)throw Error('Plano oficial incompatible.');
 if(!manifest.backgroundKey&&!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(manifest.background||''))throw Error('La vista del plano debe ser una imagen local válida.');
 if(manifest.backgroundKey&&!/^[A-Za-z0-9_-]{1,180}$/.test(manifest.backgroundKey))throw Error('Referencia de imagen inválida.');
 const next=JSON.parse(JSON.stringify(state)),r=next.residences.find(r=>r.id===manifest.residenceId);if(!r)throw Error('Selecciona una residencial existente.');
 const keys=new Set();for(const f of manifest.features){if(!f.key||keys.has(f.key)||!Array.isArray(f.points)||f.points.length<3||f.points.length>250||f.points.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)))throw Error('Trazado inválido o repetido.');keys.add(f.key);}
 r.records??={};const used=new Set(),counts={matched:0,added:0,retained:0};
 for(const f of manifest.features){let lot=next.lots.find(l=>l.residenceId===r.id&&l.sourceFeatureKey===f.key);if(!lot&&r.records[f.key]?.lotId)lot=next.lots.find(l=>l.id===r.records[f.key].lotId&&l.residenceId===r.id);if(!lot){const matches=next.lots.filter(l=>l.residenceId===r.id&&l.block===f.block&&String(l.sourceNumber||'')===String(f.number));if(matches.length===1&&!used.has(matches[0].id))lot=matches[0];}
  if(lot)counts.matched++;else{let id='OF-'+f.key.toUpperCase(),suffix=2;while(next.lots.some(l=>l.id===id))id='OF-'+f.key.toUpperCase()+'-'+suffix++;lot={id,residenceId:r.id,stage:1,block:f.block,sourceNumber:String(f.number),type:f.type||'solar',area:null,price:null,status:f.type==='private'?'private':f.initial==='sold'?'sold':'available',purchaseFromPlan:f.initial==='sold'};next.lots.push(lot);counts.added++;}
  if(used.has(lot.id))throw Error('Dos solares del plano intentan reemplazar el mismo registro.');used.add(lot.id);
  lot.sourceFeatureKey=f.key;lot.sourceMapPoints=f.points;lot.sourceMeasures=f.measurements||[];lot.planMeasurements=f.planMeasurements||f.measurements||[];lot.planAreaEstimate=f.planAreaEstimate||null;lot.officialPlanHash=manifest.sha256;lot.sourceFile=manifest.file.name;
  if(lot.area==null&&f.calculatedRectangleArea>0){lot.area=f.calculatedRectangleArea;lot.areaMode='manual';lot.areaOrigin='calculated-official-dimensions';lot.areaVerified=false;}
  r.records[f.key]={...(r.records[f.key]||{}),lotId:lot.id,block:r.records[f.key]?.block||f.block};
 }
 counts.retained=next.lots.filter(l=>l.residenceId===r.id&&!used.has(l.id)).length;
 r.features=JSON.parse(JSON.stringify(manifest.features));r.builtin=null;r.viewBox=manifest.viewBox;r.roads=[];r.pdf={...manifest.file};r.officialPlan={sha256:manifest.sha256,compressedSha256:manifest.file.sha256,...(manifest.background?{background:manifest.background}:{}),...(manifest.backgroundKey?{backgroundKey:manifest.backgroundKey}:{}),viewBox:manifest.viewBox,sourceName:manifest.file.name,importedAt:new Date().toISOString(),counts,registration:manifest.registration};
 r.inventoryMapVersion=1;r.inventoryImportSummary={sourceCount:r.features.length,added:counts.added,matched:counts.matched};
 const point=manifest.referencePoint;if(Array.isArray(point)&&point.length===2&&point.every(Number.isFinite)&&Math.abs(point[0])<=90&&Math.abs(point[1])<=180)r.geoConfig={...(r.geoConfig||{}),center:point,referencePoint:point,zoom:18,layer:'satellite',homeSet:true,referenceSource:'Captura de ubicación proporcionada por el propietario',georeferencedBoundaries:false};
 next.currentResidence=r.id;next.company.varaM2Factor??=DEFAULT_VARA_M2;return {state:next,counts};
}
