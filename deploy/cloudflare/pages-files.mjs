export function buildPagesFiles(html, version, parser) {
  const mode = "const clientMapOrigin =";
  const ocr = "const pagesContractOcr =";
  const title = /<title>[^<]*<\/title>/;
  if (!html.includes(mode) || !html.includes(ocr) || !title.test(html) ||
      !html.includes("import('./payment-fields.mjs')") || !parser.includes('export function extractPaymentFields')) {
    throw new Error('La demo cambió. Revisa los archivos de entrada para Pages.');
  }
  const release = JSON.parse(version).version;
  if (!/^\d+\.\d+\.\d+$/.test(release) || !html.includes("CURRENT_VERSION='" + release + "'")) {
    throw new Error('El HTML y version.json deben declarar la misma versión.');
  }
  const demo = html
    .replace(title, '<title>LOTIGEST · Demo</title>')
    .replace("const STORAGE='lospinos_phase1_demo_v3'; const SESSION='lospinos_demo_session';",
      "const STORAGE='lotigest_cloudflare_demo_v1'; const SESSION='lotigest_cloudflare_session';")
    .replace(mode, "const cloudflareDemo = true;\n" + mode)
    .replace(/const pagesContractOcr = [^;\n]+;/, 'const pagesContractOcr = true;')
    .replace("async function refreshClientRequests() {","async function refreshClientRequests() {\n  if (cloudflareDemo) return;")
    .replace("async function publishClientMap(button) {","async function publishClientMap(button) {\n  if (cloudflareDemo) return;")
    .replace("function pendingDashboardCard(){return","function pendingDashboardCard(){if(cloudflareDemo)return '';return")
    .replace("function clientPendingPage(){","function clientPendingPage(){\n  if(cloudflareDemo)return header('Solicitudes del mapa público','Disponible al conectar el servidor multiusuario.');")
    .replace(/<button\b[^>]*data-action="(?:client-map-publish|client-pending-open)"[^>]*>[^<]*(?:<span data-pending-count>[^<]*<\/span>)?<\/button>/g,'')
    .replace("document.head.append(adaptiveStyle);","if(adaptiveStyle) document.head.append(adaptiveStyle);")
    .replace('</head>', '<style>.lotigest-demo-banner{padding:.55rem 1rem;background:#164532;color:white;text-align:center;font:600 .875rem system-ui}[data-action="client-map-publish"],[data-action="client-pending-open"],[data-page="pending"]{display:none!important}@media print{.lotigest-demo-banner{display:none!important}}</style></head>')
    .replace(/<body(?=[ >])[^>]*>/, '$&<div class="lotigest-demo-banner">LOTIGEST · Demostración con datos ficticios. Los cambios quedan en este navegador.</div>');
  if (demo === html || !demo.includes('lotigest_cloudflare_demo_v1') ||
      !demo.includes('if (cloudflareDemo) return;') || !demo.includes('const pagesContractOcr = true;')) {
    throw new Error('No se pudo aislar el modo de demostración.');
  }
  return {
    'index.html': demo,
    'version.json': version,
    'payment-fields.mjs': parser,
    '_headers': '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n',
    '_redirects': '/prueba-diseno-v08.html / 302\n',
  };
}
