import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { buildPagesFiles } from './pages-files.mjs';

const root = new URL('../../', import.meta.url);
const out = new URL('cloudflare-pages/', root);
const [html, version, parser] = await Promise.all(
  ['prueba-diseno-v08.html', 'version.json', 'payment-fields.mjs'].map(path => readFile(new URL(path, root), 'utf8'))
);
const bridge = await readFile(new URL('./app-bridge.js', import.meta.url), 'utf8');
const files = buildPagesFiles(html, version, parser, bridge);
files['acceso-nube.js'] = await readFile(new URL('./acceso-nube.js', import.meta.url), 'utf8');
files['_redirects'] += '/clientes-nube / 302\n/clientes-nube.html / 302\n/operaciones-nube / 302\n/operaciones-nube.html / 302\n';
await mkdir(out, { recursive: true });
await Promise.all(Object.entries(files).map(([name, content]) => writeFile(new URL(name, out), content)));
console.log('Cloudflare Pages: ' + Object.keys(files).join(', '));
