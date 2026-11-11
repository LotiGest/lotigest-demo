import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { HttpError, openStore } from './store.mjs';

async function readJson(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) {
    throw new HttpError(415, 'Usa Content-Type application/json.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size <= 64 * 1024) chunks.push(chunk);
  }
  if (size > 64 * 1024) throw new HttpError(413, 'La solicitud supera 64 KiB.');
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'JSON inválido.');
  }
}

export function createLotigestServer(store) {
  return createServer({ requestTimeout: 15_000 }, async (request, response) => {
    const send = (status, body) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(JSON.stringify(body));
    };
    try {
      const actor = store.authenticate(request.headers.authorization);
      if (!actor) throw new HttpError(401, 'Se requiere una credencial válida.');
      const path = new URL(request.url, 'http://localhost').pathname;
      const match = /^\/api\/v1\/([a-z-]+)(?:\/([A-Za-z0-9_-]+))?$/.exec(path);
      if (!match) throw new HttpError(404, 'Ruta inexistente.');
      const [, resource, id] = match;
      if (request.method === 'GET') {
        send(200, resource === 'me' && !id ? actor : store.read(resource, id));
        return;
      }
      if (request.method === 'POST' && !id) {
        const data = await readJson(request);
        const currentActor = store.authenticate(request.headers.authorization);
        if (!currentActor) throw new HttpError(401, 'La credencial ya no es válida.');
        send(200, store.command(currentActor, resource, request.headers['idempotency-key'], data));
        return;
      }
      throw new HttpError(405, 'Método no admitido.');
    } catch (error) {
      if (error instanceof HttpError) {
        send(error.status, { error: error.message });
        return;
      }
      console.error('Error interno en LOTIGEST', error.code ?? error.name);
      send(500, { error: 'No se pudo completar la operación.' });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const filename = process.env.LOTIGEST_DB;
  if (!filename) throw new Error('Define LOTIGEST_DB con la ruta del archivo SQLite.');
  const store = openStore(filename);
  if (process.argv[2] === 'user') {
    const token = randomBytes(32).toString('hex');
    try {
      store.addUser(process.argv[3], process.argv[4], token);
      console.log(token);
    } finally {
      store.close();
    }
  } else {
    const port = Number(process.env.LOTIGEST_PORT ?? 8787);
    createLotigestServer(store).listen(port, '127.0.0.1', () => {
      console.log(`LOTIGEST API en http://127.0.0.1:${port}`);
    });
  }
}
