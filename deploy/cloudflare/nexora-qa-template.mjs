// Candidate build only; never reuse an existing tenant's static output.
export const neutralIcon='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="100" fill="#164532"/><path d="M150 110h65v230h150v62H150z" fill="#baff58"/></svg>';
export const neutralImage='data:image/svg+xml;base64,'+Buffer.from(neutralIcon).toString('base64');
function replaceRequired(s,pattern,replacement,label){const matches=[...s.matchAll(new RegExp(pattern.source,pattern.flags.includes('g')?pattern.flags:pattern.flags+'g'))];if(matches.length!==1)throw Error('Plantilla QA: se esperaba una coincidencia de '+label+', encontradas '+matches.length);return s.replace(pattern,()=>replacement);}
export function cleanQaHtml(html){
 let s=html;
 s=replaceRequired(s,/function seed\(\)\{[\s\S]*?\n\}\nfunction lotigestRecordDateError/,'function seed(){return cloudEmpty();}\nfunction lotigestRecordDateError','seed');
 s=replaceRequired(s,/function cloudEmpty\(\)\{[^\n]*\}/,"function cloudEmpty(){return {version:3,created:dateKey(new Date()),company:{name:'Nueva empresa QA',location:'Honduras',phone:'',email:'',documentBrandVersion:1},lots:[],clients:[],sales:[],payments:[],residences:[{id:'initial-project',name:'Primer proyecto',location:'',records:{},features:[]}],currentResidence:'initial-project'};}",'estado vacío');
 s=replaceRequired(s,/function ensureResidences\(\)\{[^\n]*\}/,"function ensureResidences(){let changed=false;if(!Array.isArray(db.residences)||!db.residences.length){db.residences=[{id:'initial-project',name:'Primer proyecto',location:'',records:{},features:[]}];changed=true}if(!db.residences.some(r=>r.id===db.currentResidence)){db.currentResidence=db.residences[0].id;changed=true}for(const l of db.lots){if(!l.residenceId){l.residenceId=db.currentResidence;changed=true}}for(const r of db.residences)if(r.features?.length&&syncMapInventory(r))changed=true;if(changed)save()}",'residenciales');
 for(const [name,value] of Object.entries({arrayanFeatures:'[]',arrayanRoadMarkup:'""',arrayanBlockLabels:'[]',arrayanStageBoundary:'[]',confirmedStageOneBlocks:'{}',officialFeatureStages:'{}',recoveredStageFeatures:'[]',arrayanStage2CommercialFive:'[]',arrayanStage2CommercialStreetPoints:'[]',OFFICIAL_MAP_MEASUREMENTS:'{source:"",sha256:"",stats:{},lots:{}}'})){
  s=replaceRequired(s,new RegExp('^const '+name+'\\s*=.*;\\r?$','m'),'const '+name+'='+value+';',name);
 }
 s=replaceRequired(s,/const OFFICIAL_LOT_PRICE_GROUPS\s*=\s*\{[\s\S]*?\n\};/,'const OFFICIAL_LOT_PRICE_GROUPS = {};','precios oficiales');
 s=replaceRequired(s,/function mapFeatures\(r\)\{[^\n]*\}/,"function mapFeatures(r){return r?.features||[]}",'mapas');
 s=replaceRequired(s,/async function cloudOfflineUnlock\(username,password\)\{/,"async function cloudOfflineUnlock(username,password){throw Error('QA requiere verificar licencia y sesión por internet.');",'acceso offline');
 s=replaceRequired(s,/async function cloudRememberLogin\(username,salt,credential\)\{[^\n]*\}/,"async function cloudRememberLogin(username,salt,credential){return;}",'credenciales offline');
 s=replaceRequired(s,/async function cloudPrepareOffline\(\)\{/,"async function cloudPrepareOffline(){return;",'service worker');
 s=s.replaceAll(/GRUPO H/gi,'LOTIGEST PRO').replaceAll(/Altos del Arrayán/gi,'Proyecto residencial').replaceAll(/altos-arrayan-vista-proyecto\.webp/gi,'app-icon.svg');
 // Drop actual embedded imagery rather than relabel a previous company's logo.
 s=s.replace(/data:image\/(?:webp|png|jpe?g);base64,[A-Za-z0-9+/=]{128,}/g,neutralImage);
 s=s.replaceAll('lotigest_cloudflare_demo_v1','lotigest_nexora_qa_state_v1').replaceAll('lotigest_cloudflare_session','lotigest_nexora_qa_session').replaceAll('lotigest_d1_pending_v1','lotigest_nexora_qa_pending_v1').replaceAll('lotigest_offline_profile_v1','lotigest_nexora_qa_profile_v1');
 if(/GRUPO H|Altos del Arrayán|const arrayanFeatures=\[\{/i.test(s))throw Error('Plantilla QA contiene datos conocidos de otro cliente.');
 return s;
}
export function cleanQaFiles(files){
 const out={...files,index:undefined};delete out.index;
 out['index.html']=cleanQaHtml(out['index.html']);
 delete out['altos-arrayan-vista-proyecto.webp'];delete out['app-icon-192.png'];delete out['app-icon-512.png'];
 out['app-icon.svg']=neutralIcon;
 out['manifest.webmanifest']=JSON.stringify({...JSON.parse(out['manifest.webmanifest']),icons:[{src:'/app-icon.svg',sizes:'any',type:'image/svg+xml'}]});
 // No cached application or offline access to licensed data in this first QA candidate.
 out['service-worker.js']="self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.registration.unregister()));";
 for(const key of ['seleccionar-solar.html','verificar-recibo.html'])if(typeof out[key]==='string')out[key]=out[key].replaceAll(/GRUPO H/gi,'LOTIGEST PRO').replaceAll(/Altos del Arrayán/gi,'Proyecto residencial').replace(/data:image\/(?:webp|png|jpe?g);base64,[A-Za-z0-9+/=]{128,}/g,neutralImage);
 return out;
}
