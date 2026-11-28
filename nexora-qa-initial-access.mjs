// Product adapter candidate for LotiGest. Not mounted on an operational installation.
// The one-time invitation is not a login credential; the customer chooses a new password before any account exists.
const HEX=/^[0-9a-f]{64}$/;
const ID=/^qa-[a-z0-9-]{3,55}$/;
const USER=/^[a-z0-9][a-z0-9_-]{2,39}$/;
const bytes=s=>new TextEncoder().encode(s);
const hex=b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
export const digest=async s=>hex(await crypto.subtle.digest('SHA-256',bytes(s)));
function identity(id,user){if(typeof id!=='string'||typeof user!=='string'||!ID.test(id)||!USER.test(user)||user==='lotigest-admin')throw Error('Identidad QA o usuario no válido.');}
export async function issueInitialInvite(db,{installationId,username,now=Date.now(),ttl=86400000}){
 identity(installationId,username);if(!Number.isSafeInteger(now)||now<0||!Number.isSafeInteger(ttl)||ttl<60000||ttl>86400000||!Number.isSafeInteger(now+ttl))throw Error('Vigencia inválida.');
 const token=hex(crypto.getRandomValues(new Uint8Array(32))),hash=await digest('nexora-invite:'+installationId+':'+token);
 const res=await db.prepare('INSERT INTO nexora_initial_access(installation_id,username,invite_hash,expires_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM nexora_installation_identity WHERE singleton=1 AND installation_id=? AND environment=\'qa\') AND NOT EXISTS(SELECT 1 FROM users) AND NOT EXISTS(SELECT 1 FROM d1_user_passwords) AND NOT EXISTS(SELECT 1 FROM nexora_initial_access WHERE installation_id<>?) ON CONFLICT(installation_id) DO UPDATE SET invite_hash=excluded.invite_hash,expires_at=excluded.expires_at WHERE nexora_initial_access.consumed_at IS NULL AND nexora_initial_access.expires_at<=? AND nexora_initial_access.username=excluded.username').bind(installationId,username,hash,now+ttl,installationId,installationId,now).run();
 if(res.meta.changes!==1)throw Error('La instalación no está vacía o ya tiene invitación.');
 return {installationId,username,token,expiresAt:now+ttl}; // Deliver once; do not log or persist token.
}
export async function claimInitialInvite(db,{installationId,username,token,salt,tokenHash,now=Date.now()}){
 identity(installationId,username);
 if([token,salt,tokenHash].some(x=>typeof x!=='string'||!HEX.test(x))||!Number.isSafeInteger(now)||now<0)throw Error('Solicitud inválida.');
 const hash=await digest('nexora-invite:'+installationId+':'+token);
 if(tokenHash===await digest(token)||tokenHash===hash)throw Error('La invitación no puede utilizarse como contraseña.');
 const result=await db.batch([
 db.prepare("INSERT INTO users(name,role,token_hash) SELECT username,'admin',? FROM nexora_initial_access WHERE installation_id=? AND username=? AND invite_hash=? AND expires_at>? AND consumed_at IS NULL AND NOT EXISTS(SELECT 1 FROM users) AND NOT EXISTS(SELECT 1 FROM d1_user_passwords) AND EXISTS(SELECT 1 FROM nexora_installation_identity WHERE singleton=1 AND installation_id=? AND environment='qa')").bind(tokenHash,installationId,username,hash,now,installationId),
 db.prepare('INSERT INTO d1_user_passwords(name,salt) SELECT ?,? WHERE changes()=1').bind(username,salt),
 db.prepare('UPDATE nexora_initial_access SET consumed_at=? WHERE installation_id=? AND username=? AND invite_hash=? AND consumed_at IS NULL AND changes()=1').bind(now,installationId,username,hash)
 ]);
 if(result.some(r=>r.meta.changes!==1))return {ok:false};
 return {ok:true,username,role:'admin'};
}
// Server checks the deployment identity, not a client-selected tenant. No login/session cookie issued here.
export function createClaimHandler({clock=Date.now}={}){return async(request,env)=>{
 const reply=(body,status)=>Response.json(body,{status,headers:{'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});
 if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
 if(env.NEXORA_QA_BOOTSTRAP!=='enabled'||!ID.test(env.LOTIGEST_INSTALLATION_ID??'')||!env.LOTIGEST_DB)return reply({error:'not_available'},503);
 if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')return reply({error:'forbidden_origin'},403);
 if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return reply({error:'invalid_content_type'},415);
 try{const reader=request.body?.getReader();if(!reader)return reply({error:'invalid_request'},400);let raw='',size=0;const decoder=new TextDecoder();for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>1024){await reader.cancel();return reply({error:'invalid_request'},413);}raw+=decoder.decode(value,{stream:true});}const x=JSON.parse(raw+decoder.decode());if(!x||Object.keys(x).some(k=>!['username','token','salt','tokenHash'].includes(k)))return reply({error:'invalid_request'},400);
 const result=await claimInitialInvite(env.LOTIGEST_DB,{installationId:env.LOTIGEST_INSTALLATION_ID,username:x.username,token:x.token,salt:x.salt,tokenHash:x.tokenHash,now:clock()});
 return result.ok?reply({ok:true,username:result.username,role:'admin'},201):reply({error:'invalid_or_expired_invite'},403);
 }catch{return reply({error:'activation_failed'},400);}
};}
