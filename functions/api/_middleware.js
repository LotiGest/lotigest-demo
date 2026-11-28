// Enforcement only for explicitly configured, fictitious Nexora QA installations.
// The existing deployment does not use this mode. Never activate it on real data.
export async function onRequest(context){
 const {env,request,next}=context;
 const identity=env.LOTIGEST_INSTALLATION_ID;
 if(env.NEXORA_QA_LICENSE===undefined&&identity===undefined)return next();
 const reply=(status,error)=>Response.json({error},{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
 if(env.NEXORA_QA_LICENSE!=='enabled'||typeof identity!=='string'||!/^qa-[a-z0-9-]{3,55}$/.test(identity)||!env.LOTIGEST_DB)return reply(503,'installation_unverified');
 try{
  const row=await env.LOTIGEST_DB.prepare("SELECT i.installation_id,i.environment,l.contract_id,l.license_version,l.contract_version,l.plan_code,l.state,l.starts_on,l.expires_on,l.grace_until FROM nexora_installation_identity i LEFT JOIN nexora_qa_entitlement l ON l.installation_id=i.installation_id WHERE i.singleton=1").first();
  if(!row||row.installation_id!==identity||row.environment!=='qa')return reply(503,'installation_unverified');
  if(row.contract_id!=='LOTIGEST__'+identity||!Number.isSafeInteger(row.license_version)||row.license_version<1||!Number.isSafeInteger(row.contract_version)||row.contract_version<1||!['promocion','profesional','empresarial','corporativo'].includes(row.plan_code))return reply(403,'license_unverified');
  const day=s=>typeof s==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
  if(![row.starts_on,row.expires_on,row.grace_until].every(day)||row.starts_on>row.expires_on||row.expires_on>row.grace_until||Date.parse(row.grace_until)-Date.parse(row.expires_on)>30*86400000)return reply(403,'license_unverified');
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Tegucigalpa',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  // QA grace is deliberately conservative: read-only, no new login/activation/writes.
  const path=new URL(request.url).pathname;
  if(path==='/api/app/session'&&request.method==='DELETE')return next();
  if(row.state!=='issued'||today<row.starts_on||today>row.grace_until)return reply(403,'license_inactive');
  if(today>row.expires_on&&request.method!=='GET')return reply(403,'license_grace_read_only');
  if(path==='/api/d1/users'&&request.method==='PUT')return reply(403,'legacy_activation_disabled');
  return next();
 }catch{return reply(503,'license_verification_unavailable');}
}
