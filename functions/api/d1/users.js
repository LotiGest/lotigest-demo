const json = (body, status = 200) => Response.json(body, {
  status, headers: {'Cache-Control':'no-store'}
});
const validName = name => typeof name === 'string' && /^[a-z0-9][a-z0-9_-]{2,39}$/.test(name);
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
async function hash(value) {
  const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte=>byte.toString(16).padStart(2,'0')).join('');
}
export async function onRequest({request,env}) {
  const db = env.LOTIGEST_DB;
  if (!db) return json({error:'Base de datos no disponible.'},503);
  try {
    const username = new URL(request.url).searchParams.get('username');
    if (request.method==='GET' && username!==null) {
      if (!validName(username)) return json({error:'Usuario inválido.'},400);
      const row = await db.prepare('SELECT salt FROM d1_user_passwords WHERE name=?').bind(username).first();
      return json({salt:row?.salt ?? await hash('lotigest-inactive-user:'+username)});
    }
    const token = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('Authorization')||'')?.[1];
    if (!token) return json({error:'Se requiere iniciar sesión.'},401);
    const actor = await db.prepare('SELECT role FROM users WHERE token_hash=?').bind(await hash(token)).first();
    if (!actor) return json({error:'Credencial inválida.'},401);
    if (actor.role!=='admin') return json({error:'Solo un administrador puede gestionar usuarios.'},403);
    if (request.method==='GET') {
      const after = new URL(request.url).searchParams.get('after') ?? '';
      if (after && !/^[A-Za-z0-9_-]{1,100}$/.test(after)) return json({error:'Código inválido.'},400);
      const {results} = await db.prepare('SELECT name,role FROM users WHERE name>? ORDER BY name LIMIT 101').bind(after).all();
      const users = results.slice(0,100);
      return json({users,next:results.length>100?users.at(-1).name:null});
    }
    if (request.method!=='POST') return json({error:'Método no permitido.'},405);
    if (request.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json') return json({error:'Se requiere JSON.'},415);
    let body;
    try {
      const reader=request.body.getReader(), decoder=new TextDecoder();
      let input='', size=0;
      for (;;) {
        const {value,done}=await reader.read();
        if (done) break;
        size+=value.length;
        if (size>2048) {
          await reader.cancel();
          return json({error:'Solicitud demasiado grande.'},413);
        }
        input+=decoder.decode(value,{stream:true});
      }
      body=JSON.parse(input+decoder.decode());
    } catch { return json({error:'Solicitud inválida.'},400); }
    const {name,role,salt,token_hash}=body??{};
    if (!validName(name)||!['admin','sales'].includes(role)||!hex(salt)||!hex(token_hash)) {
      return json({error:'Revisa el usuario y el perfil.'},400);
    }
    const [created] = await db.batch([
      db.prepare('INSERT INTO users (name,role,token_hash) VALUES (?,?,?) ON CONFLICT DO NOTHING').bind(name,role,token_hash),
      db.prepare('INSERT INTO d1_user_passwords (name,salt) SELECT ?,? WHERE changes()=1').bind(name,salt)
    ]);
    return created.meta.changes ? json({name,role},201) : json({error:'El usuario o la credencial ya existe.'},409);
  } catch (error) {
    console.error('LOTIGEST D1 users',error.name);
    return json({error:'No fue posible gestionar usuarios.'},503);
  }
}
