import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { buildPagesFiles } from './pages-files.mjs';

const root = new URL('../../', import.meta.url);
const out = new URL('cloudflare-pages/', root);
const [html, version, parser] = await Promise.all(
  ['prueba-diseno-v08.html', 'version.json', 'payment-fields.mjs'].map(path => readFile(new URL(path, root), 'utf8'))
);
const bridge = (await readFile(new URL('./app-bridge.js', import.meta.url), 'utf8'))+'\n'+(await readFile(new URL('./ledger-ui.js', import.meta.url), 'utf8'))+'\n'+(await readFile(new URL('./owner-payments-ui.js', import.meta.url), 'utf8'))+'\n'+(await readFile(new URL('./collection-fichas.js', import.meta.url), 'utf8'))+'\n'+(await readFile(new URL('./manual-owner-history-ui.js', import.meta.url), 'utf8'))+'\n'+(await readFile(new URL('./receipt-ocr-ui.js', import.meta.url), 'utf8'))+'\n'+(await readFile(new URL('./receipt-qr-ui.js', import.meta.url), 'utf8'))+'\n'+(await readFile(new URL('./payment-modal-ui.js', import.meta.url), 'utf8'))+'\n'+(await readFile(new URL('./historical-payment-modal-ui.js', import.meta.url), 'utf8'))+'\n'+(await readFile(new URL('./payment-money-ui.js', import.meta.url), 'utf8'))+'\n'+(await readFile(new URL('./prima-status-ui.js', import.meta.url), 'utf8'));
const landBridge=(await readFile(new URL('land-inventory.mjs',root),'utf8')).replace(/export /g,'')+'\n'+await readFile(new URL('./land-inventory-ui.js',import.meta.url),'utf8')+'\n'+await readFile(new URL('./client-name-identity-search-ui.js',import.meta.url),'utf8')+'\n'+(await readFile(new URL('official-prices.mjs',root),'utf8')).replace(/export /g,'')+'\n'+await readFile(new URL('./official-prices-ui.js',import.meta.url),'utf8')+'\n'+await readFile(new URL('./client-public-notifications-ui.js',import.meta.url),'utf8')+'\n'+await readFile(new URL('./import-center-ui.js',import.meta.url),'utf8')+'\n'+await readFile(new URL('./solar-touch-zoom.js',import.meta.url),'utf8')+'\n'+(await readFile(new URL('contract-intake-core.mjs',root),'utf8')).replace(/export /g,'')+'\n'+await readFile(new URL('./contract-intake-ui.js',import.meta.url),'utf8');
const files = buildPagesFiles(html.replace(/CURRENT_VERSION='[^']+'/, "CURRENT_VERSION='"+JSON.parse(version).version+"'"), version, parser, bridge+'\n'+landBridge);
files['acceso-nube.js'] = await readFile(new URL('./acceso-nube.js', import.meta.url), 'utf8');
files['seleccionar-solar.html'] = await readFile(new URL('./seleccionar-solar.html', import.meta.url), 'utf8');
files['mobile-layout.js'] = await readFile(new URL('./mobile-layout.js', import.meta.url), 'utf8');
files['mobile-layout.css'] = await readFile(new URL('./mobile-layout.css', import.meta.url), 'utf8');
files['payment-modal.css'] = await readFile(new URL('./payment-modal.css', import.meta.url), 'utf8');
files['index.html']=files['index.html'].replace('</head>','<script src="/qr-generator.js"></script><script src="/lotigestPaperReceipt.js"></script><script src="/lotigestOcrAbonos.js"></script><link rel="stylesheet" href="/mobile-layout.css"><link rel="stylesheet" href="/payment-modal.css"><script src="/mobile-layout.js" defer></script></head>');
files['qr-generator.js']=await readFile(new URL('./vendor/qr-generator.js',import.meta.url),'utf8');
files['verificar-recibo.html']=await readFile(new URL('./verificar-recibo.html',import.meta.url),'utf8');
// El paquete Pages no contiene /ocr local. Usar el lector Tesseract del CDN en esta compilación.
files['index.html']=files['index.html'].replace(/const pagesContractOcr\s*=\s*[^;]+;/, 'const pagesContractOcr = true;');
files['offline-files.js'] = await readFile(new URL('./offline-files.js', import.meta.url), 'utf8');
for (const [path,name,exports] of [['ledger-import.mjs','lotigestLedger',['prepareLedgerImport','applyLedgerImport','regularizeHistoricalContract','historyCents','parseHistoryDate','historyLotCandidates','historyIssueLabels']],['owner-payments.mjs','lotigestOwnerPayments',['createOwnerPayment','ownerStatementBalance','ownerAllocationReferences','validateOwnerPayments']],['cadastre.mjs','lotigestCadastre',['applyOfficialPlan','areaInVaras','DEFAULT_VARA_M2','VARA_SOURCE']],['paper-receipt-parser.mjs','lotigestPaperReceipt',['extractPaperReceipt']],['ocr-abonos-core.mjs','lotigestOcrAbonos',['ocrReference','normOcr','ownerLotsForOcr','matchOcrReceipt','receiptDuplicate','verifiedInstallments']]]) { const source=(await readFile(new URL(path,root),'utf8')).replace(/export /g,''); files[name+'.js']='(()=>{'+source+';window.'+name+'={'+exports.join(',')+'};})();'; }
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
