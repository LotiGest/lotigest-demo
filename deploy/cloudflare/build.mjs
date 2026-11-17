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
files['offline-files.js'] = await readFile(new URL('./offline-files.js', import.meta.url), 'utf8');
files['service-worker.js'] = (await readFile(new URL('./service-worker.js', import.meta.url), 'utf8')).replace('__LOTIGEST_VERSION__', JSON.parse(version).version);
const icon = /<link rel="icon" href="(data:image\/webp;base64,[^"]+)"/.exec(html)?.[1];
if (!icon) throw new Error('Falta el icono original de LOTIGEST.');
files['app-icon.svg'] = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="100" fill="#164532"/><image href="${icon}" x="32" y="88" width="448" height="336"/></svg>`;
files['manifest.webmanifest'] = JSON.stringify({name:'LOTIGEST · Gestión de lotificaciones',short_name:'LOTIGEST',start_url:'/',scope:'/',display:'standalone',background_color:'#164532',theme_color:'#164532',lang:'es-HN',icons:[{src:'/app-icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any'}]});
files['_headers'] += '/service-worker.js\n  Cache-Control: no-cache\n';

files['_redirects'] += '/clientes-nube / 302\n/clientes-nube.html / 302\n/operaciones-nube / 302\n/operaciones-nube.html / 302\n';
await mkdir(out, { recursive: true });
await Promise.all(Object.entries(files).map(([name, content]) => writeFile(new URL(name, out), content)));
console.log('Cloudflare Pages: ' + Object.keys(files).join(', '));
