import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { HttpError, openStore } from './store.mjs';

async function readJson(request, limit = 64 * 1024) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) {
    throw new HttpError(415, 'Usa Content-Type application/json.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size <= limit) chunks.push(chunk);
  }
  if (size > limit) throw new HttpError(413, 'La solicitud supera el tamaño permitido.');
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'JSON inválido.');
  }
}

const assets = new Map([
  ['/', ['workspace.html', 'text/html']],
  ['/workspace.mjs', ['workspace.mjs', 'text/javascript']],
  ['/workspace.css', ['workspace.css', 'text/css']],
].map(([route, [file, type]]) => [route, [readFileSync(new URL(file, import.meta.url)), type]]));

const approvedPanel = readFileSync(new URL('../prueba-diseno-v08.html', import.meta.url), 'utf8');
const approvedMarkup = approvedPanel.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const approvedStyles = [...approvedMarkup.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(match => match[1]).join('\n');
const approvedIcon = approvedPanel.match(/<link rel="icon" href="data:image\/webp;base64,([A-Za-z0-9+/=]+)"/);
if (!approvedStyles || !approvedIcon) throw new Error('Faltan los estilos o el icono del panel aprobado.');
assets.set('/approved-panel.css', [approvedStyles, 'text/css']);
assets.set('/lotigest-icon.webp', [Buffer.from(approvedIcon[1], 'base64'), 'image/webp']);

const excelReader = approvedPanel.match(/<script>\s*\/\/ Read ordinary \.xlsx[\s\S]*?<\/script>/)?.[0]
  .replace(/^<script>|<\/script>$/g, '');
const csvReader = approvedPanel.match(/function buyerCsvRows\(text\) \{[\s\S]*?(?=\nfunction buyerImportTemplate)/)?.[0];
if (!excelReader || !csvReader) throw new Error('Faltan los lectores de Excel del panel aprobado.');
assets.set('/spreadsheet-reader.mjs', [excelReader + csvReader + '\nexport { readExcelRows, buyerCsvRows };', 'text/javascript']);
assets.set('/client-import.mjs', [readFileSync(new URL('./client-import.mjs', import.meta.url)), 'text/javascript']);

export function createLotigestServer(store, { tls, secureCookies = !!tls } = {}) {
  const sessions = new Map();
  const sessionCookie = (id, age) => 'lotigest_session=' + id + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + age + (secureCookies ? '; Secure' : '');
  const options = { requestTimeout: 15_000 };
  const handle = async (request, response) => {
    const send = (status, body) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(JSON.stringify(body));
    };
    try {
      const path = new URL(request.url, 'http://localhost').pathname;
      const asset = assets.get(path);
      if (request.method === 'GET' && asset) {
        response.writeHead(200, { 'Content-Type': asset[1] + '; charset=utf-8',
          'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
        response.end(asset[0]);
        return;
      }
      if (request.method === 'POST' && request.headers['sec-fetch-site'] &&
          request.headers['sec-fetch-site'] !== 'same-origin') throw new HttpError(403, 'Origen no autorizado.');
      const sessionId = /(?:^|; *)lotigest_session=([a-f0-9]{64})(?:;|$)/.exec(request.headers.cookie ?? '')?.[1];
      function authorization() {
        const session = sessions.get(sessionId);
        return request.headers.authorization ??
          (session && session.expires > Date.now() ? session.authorization : undefined);
      }
      if (request.method === 'POST' && path === '/api/v1/session') {
        const data = await readJson(request);
        const credential = typeof data?.token === 'string' ? 'Bearer ' + data.token : '';
        const user = store.authenticate(credential);
        if (!user) throw new HttpError(401, 'Credencial incorrecta.');
        for (const [key, active] of sessions) if (active.expires <= Date.now()) sessions.delete(key);
        sessions.delete(sessionId);
        if (sessions.size >= 1000) throw new HttpError(503, 'Demasiadas sesiones activas.');
        const id = randomBytes(32).toString('hex');
        const lifetime = 8 * 60 * 60;
        sessions.set(id, { authorization: credential, expires: Date.now() + lifetime * 1000 });
        response.setHeader('Set-Cookie', sessionCookie(id, lifetime));
        send(200, user);
        return;
      }
      if (request.method === 'POST' && path === '/api/v1/logout') {
        sessions.delete(sessionId);
        response.setHeader('Set-Cookie', sessionCookie('', 0));
        send(200, { signed_out: true });
        return;
      }
      const actor = store.authenticate(authorization());
      if (!actor) throw new HttpError(401, 'Se requiere una credencial válida.');
      const match = /^\/api\/v1\/([a-z-]+)(?:\/([A-Za-z0-9_-]+))?$/.exec(path);
      if (!match) throw new HttpError(404, 'Ruta inexistente.');
      const [, resource, id] = match;
      if (request.method === 'GET') {
        const data = resource === 'me' && !id ? actor :
          resource === 'command-status' && id ? store.commandStatus(actor, id) : store.read(resource, id);
        send(200, data);
        return;
      }
      if (request.method === 'POST' && !id) {
        const data = await readJson(request, resource === 'client-import' ? 512 * 1024 : undefined);
        const currentActor = store.authenticate(authorization());
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
  };
  return tls ? createHttpsServer({ ...tls, ...options }, handle) : createServer(options, handle);
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
    const { LOTIGEST_TLS_CERT: cert, LOTIGEST_TLS_KEY: key, LOTIGEST_HOST: host = '127.0.0.1' } = process.env;
    if (!!cert !== !!key) throw new Error('Define LOTIGEST_TLS_CERT y LOTIGEST_TLS_KEY juntos.');
    const tls = cert ? { cert: readFileSync(cert), key: readFileSync(key) } : undefined;
    if (!tls && !['127.0.0.1', '::1', 'localhost'].includes(host)) throw new Error('Se requiere TLS para escuchar fuera de loopback.');
    createLotigestServer(store, { tls, secureCookies: !!tls || process.env.LOTIGEST_SECURE_COOKIES === '1' }).listen(port, host, () => {
      console.log('LOTIGEST en ' + (tls ? 'https://' : 'http://') + host + ':' + port);
    });
  }
}
