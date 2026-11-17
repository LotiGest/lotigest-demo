const bytes = value=>new TextEncoder().encode(value);
function hex(value) {
  return Array.from(new Uint8Array(value),byte=>byte.toString(16).padStart(2,'0')).join('');
}
async function derive(password,salt) {
  const key=await crypto.subtle.importKey('raw',bytes(password),'PBKDF2',false,['deriveBits']);
  return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',iterations:600000,salt:bytes(salt)},key,256));
}
async function api(token,options={}) {
  const {query='',data}=options;
  const response=await fetch('/api/d1/users'+query,{
    method:data?'POST':'GET',cache:'no-store',
    headers:{...(token?{Authorization:'Bearer '+token}:{}),...(data?{'Content-Type':'application/json'}:{})},
    body:data?JSON.stringify(data):undefined
  });
  const result=await response.json();
  if (!response.ok) throw new Error(result.error || 'No fue posible completar la solicitud.');
  return result;
}
window.lotigestAccess={
  async credential(username,password) {
    const name=username.trim().toLowerCase();
    if (!name) return password.trim();
    const {salt}=await api('',{query:'?'+new URLSearchParams({username:name})});
    return derive(password,salt);
  },
  list(token,after='') {
    return api(token,{query:'?'+new URLSearchParams({after})});
  },
  async create(token,form) {
    const name=form.get('name').trim().toLowerCase(), role=form.get('role');
    const password=form.get('password');
    if (password.length<14||password.length>128||password!==form.get('confirm')) {
      throw new Error('Usa entre 14 y 128 caracteres y confirma la misma contraseña.');
    }
    const salt=hex(crypto.getRandomValues(new Uint8Array(32)));
    const credential=await derive(password,salt);
    const token_hash=hex(await crypto.subtle.digest('SHA-256',bytes(credential)));
    return api(token,{data:{name,role,salt,token_hash}});
  }
};
