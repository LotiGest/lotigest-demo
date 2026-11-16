import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { buildPagesFiles } from './pages-files.mjs';

const root = new URL('../../', import.meta.url);
const out = new URL('cloudflare-pages/', root);
const [html, version, parser] = await Promise.all(
  ['prueba-diseno-v08.html', 'version.json', 'payment-fields.mjs'].map(path => readFile(new URL(path, root), 'utf8'))
);
const files = buildPagesFiles(html, version, parser);
await mkdir(out, { recursive: true });
await Promise.all(Object.entries(files).map(([name, content]) => writeFile(new URL(name, out), content)));
console.log('Cloudflare Pages: ' + Object.keys(files).join(', '));
