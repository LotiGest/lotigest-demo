const headers = { 'Cache-Control': 'no-store' };
const clientColumns = "SELECT c.id, c.name, x.identity, COALESCE(x.phone, '') AS phone, COALESCE(x.email, '') AS email, COALESCE(x.address, '') AS address FROM clients c LEFT JOIN client_contacts x ON x.client_id = c.id";
const json = (body, status = 200) => Response.json(body, { status, headers });

export async function onRequest({ request, env }) {
  if (!['GET', 'POST'].includes(request.method)) {
    return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET, POST' } });
  }
  const token = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('Authorization') || '')?.[1];
  if (!token) return json({ error: 'Se requiere una credencial de LOTIGEST.' }, 401);
  if (!env.LOTIGEST_DB) return json({ error: 'La base de datos no está disponible.' }, 503);

  try {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    const hash = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
    const user = await env.LOTIGEST_DB.prepare('SELECT role, panels_json FROM users LEFT JOIN user_panels USING (name) WHERE token_hash = ?').bind(hash).first();
    if (!user) return json({ error: 'Credencial inválida.' }, 401);
    if (!['admin', 'sales'].includes(user.role)) return json({ error: 'Acceso restringido.' }, 403);

    if (user.role === 'sales' && user.panels_json && !JSON.parse(user.panels_json).includes('clients')) {
      return json({ error: 'Acceso restringido.' }, 403);
    }

    if (request.method === 'GET') {
      const after = new URL(request.url).searchParams.get('after') ?? '';
      if (after && !/^[A-Za-z0-9_-]{1,100}$/.test(after)) return json({ error: 'Paginación inválida.' }, 400);
      const { results } = await env.LOTIGEST_DB.prepare(
        clientColumns + ' WHERE c.id > ? ORDER BY c.id LIMIT 101'
      ).bind(after).all();
      const clients = results.slice(0, 100);
      return json({ clients, next: results.length > 100 ? clients.at(-1).id : null });
    }

    if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return json({ error: 'Se requiere JSON.' }, 415);
    }
    const reader = request.body?.getReader();
    if (!reader) return json({ error: 'Se requiere un cliente.' }, 400);
    const decoder = new TextDecoder();
    let raw = '';
    let size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        return json({ error: 'Solicitud demasiado grande.' }, 413);
      }
      raw += decoder.decode(value, { stream: true });
    }
    let body;
    try { body = JSON.parse(raw + decoder.decode()); }
    catch { return json({ error: 'JSON inválido.' }, 400); }
    const id = body?.id;
    const name = typeof body?.name === 'string' ? body.name.trim().toUpperCase() : '';
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(id) || !name || name.length > 200) {
      return json({ error: 'Identificador o nombre inválido.' }, 400);
    }

    const fields = {};
    for (const [key, limit] of Object.entries({ identity: 32, phone: 40, email: 180, address: 250 })) {
      const value = body[key] ?? '';
      if (typeof value !== 'string' || value.trim().length > limit) {
        return json({ error: 'Revisa los datos de contacto.' }, 400);
      }
      fields[key] = value.trim();
    }
    fields.identity = fields.identity.toUpperCase().replace(/[ -]/g, '') || null;
    if ((fields.identity && !/^[A-Z0-9]+$/.test(fields.identity)) ||
        (fields.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fields.email))) {
      return json({ error: 'Revisa la identidad y el correo.' }, 400);
    }

    const db = env.LOTIGEST_DB;
    const [write, , read] = await db.batch([
      db.prepare('INSERT INTO clients (id, name) VALUES (?, ?) ON CONFLICT(id) DO NOTHING').bind(id, name),
      db.prepare(`INSERT INTO client_contacts (client_id, identity, phone, email, address)
        SELECT id, ?, ?, ?, ? FROM clients WHERE id = ? AND name = ? AND changes() = 1
        ON CONFLICT(client_id) DO NOTHING`).bind(fields.identity, fields.phone, fields.email, fields.address, id, name),
      db.prepare(clientColumns + ' WHERE c.id = ?').bind(id)
    ]);
    const client = read.results[0];
    if (client?.name !== name || Object.entries(fields).some(([key, value]) => Object.hasOwn(body, key) && client[key] !== value)) {
      return json({ error: 'El código ya está registrado con otros datos.' }, 409);
    }
    return json({ client }, write.meta.changes ? 201 : 200);
  } catch (error) {
    if (/UNIQUE constraint failed: client_contacts.identity/i.test(error.message)) {
      return json({ error: 'La identidad ya está registrada.' }, 409);
    }
    console.error('LOTIGEST D1 clients request failed', error.name);
    return json({ error: 'No fue posible consultar o guardar el cliente.' }, 503);
  }
}
