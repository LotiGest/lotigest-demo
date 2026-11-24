import {OFFICIAL_MAP_MEASUREMENTS} from './official-map-measurements-data.mjs';
// A PDF label is authoritative for that edge only; shared-boundary rows retain their source.
// Never replace negotiated dimensions, area, price, owner, payments or manual GPS coordinates.
export function applyOfficialMapMeasurements(state){
 if(!state)return false;
 const residence=(state.residences||[]).find(r=>r.id==='arrayan');
 if(!residence||!(residence.builtin==='arrayan'||residence.officialPlan?.sha256===OFFICIAL_MAP_MEASUREMENTS.sha256))return false;
 let changed=false;
 for(const lot of state.lots||[]){
  if(lot.residenceId!=='arrayan')continue;
  const row=OFFICIAL_MAP_MEASUREMENTS.lots[lot.sourceFeatureKey];if(!row)continue;
  const edges=row.edges.map(e=>({edge:e.index,value:e.value,origin:e.origin,...(e.sourceFeatureKey?{sourceFeatureKey:e.sourceFeatureKey,sourceEdge:e.sourceEdge}:{})}));
  const measures=edges.filter(e=>e.value!=null).map(e=>e.value);
  for(const [key,value] of Object.entries({sourceMeasures:measures,sourceMeasurementEdges:edges,sourceMeasurementVersion:OFFICIAL_MAP_MEASUREMENTS.sha256,sourceMeasurementFile:OFFICIAL_MAP_MEASUREMENTS.source})){
   if(JSON.stringify(lot[key])!==JSON.stringify(value)){lot[key]=value;changed=true;}
  }
 }
 return changed;
}
