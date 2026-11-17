export const json = (body,status=200,headers={}) => Response.json(body,{status,headers:{'Cache-Control':'no-store',...headers}});
export async function hash(value) {
 const out=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
 return Array.from(new Uint8Array(out),b=>b.toString(16).padStart(2,'0')).join('');
}
export function sameOrigin(request) {
 const origin=request.headers.get('Origin');
 return (!origin || origin===new URL(request.url).origin) && request.headers.get('Sec-Fetch-Site')!=='cross-site';
}
export async function actor(request,db) {
 const session=/(?:^|;\s*)lotigest_session=([a-f0-9]{64})(?:;|$)/.exec(request.headers.get('Cookie')||'')?.[1];
 if(!session)return null;
 return db.prepare('SELECT u.name,u.role FROM app_sessions s JOIN users u ON u.name=s.username WHERE s.hash=? AND s.expires>?').bind(await hash(session),Date.now()).first();
}
export async function body(request,limit) {
 if(request.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json')throw Object.assign(Error('Se requiere JSON.'),{status:415});
 const reader=request.body?.getReader();if(!reader)throw Object.assign(Error('Solicitud vacía.'),{status:400});
 let text='',size=0;const decoder=new TextDecoder();
 for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw Object.assign(Error('Los datos superan el tamaño permitido. Descarga un respaldo; no se modificó el servidor.'),{status:413});}text+=decoder.decode(value,{stream:true});}
 try{return JSON.parse(text+decoder.decode());}catch{throw Object.assign(Error('JSON inválido.'),{status:400});}
}
export function failure(error) {
 if(error.status)return json({error:error.message},error.status);
 console.error(JSON.stringify({event:'app_storage_error',type:error.name}));
 return json({error:'El servidor no pudo completar la operación. Tus cambios pendientes se conservan.'},503);
}
