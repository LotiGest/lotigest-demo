export function buildPagesFiles(html, version, parser, bridge) {
  const mode = "const clientMapOrigin =";
  const ocr = "const pagesContractOcr =";
  const title = /<title>[^<]*<\/title>/;
  if (!html.includes(mode) || !html.includes(ocr) || !title.test(html) ||
      !html.includes("import('./payment-fields.mjs')") || !parser.includes('export function extractPaymentFields')) {
    throw new Error('La demo cambió. Revisa los archivos de entrada para Pages.');
  }
  if (!bridge?.includes('async function cloudLoad()')) throw new Error('Falta el puente D1.');
  const release = JSON.parse(version).version;
  if (!/^\d+\.\d+\.\d+$/.test(release) || !html.includes("CURRENT_VERSION='" + release + "'")) {
    throw new Error('El HTML y version.json deben declarar la misma versión.');
  }
  const demo = html
    .replace(title, '<title>LOTIGEST · GRUPO H</title>')
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
    .replace(/localStorage\.setItem\(STORAGE,/g, 'cloudWrite(')
    .replace('let db,storedLotigest;', bridge + '\nlet db,storedLotigest;')
    .replace('db=readStoredLotigest(storedLotigest);', 'db=cloudEmpty();')
    .replace("case 'logout':sessionStorage.removeItem(SESSION);page='dashboard';render();break;", "case 'logout':cloudLogout();break;")
    .replace(/if\(e.target.id==='login-form'\)\{.*?return\}if\(e.target.matches\('form#modal-form'\)\)/, "if(e.target.id==='login-form'){e.preventDefault();cloudLogin(e.target);return}if(e.target.matches('form#modal-form'))")
    .replace('if(!hasStored)save();render();setTimeout(refreshClientRequests,500);', 'render();setTimeout(cloudBoot,0);')
    .replace(/<div class="demo-login-hint">[\s\S]*?<\/div>/, '<div class="demo-login-hint">Acceso privado. Los datos se guardan en Cloudflare D1. Usa tu cuenta administradora.</div>')
    .replace(/function usersPage\(\)\{[\s\S]*?\n\/\* Fase 2/, 'function usersPage(){return cloudUsersPage()}\n/* Fase 2')
    .replace("function handlerAction(action,el){", "function handlerAction(action,el){if(action==='reset-demo'){toast('El reinicio de demostración está desactivado en el servidor.','error');return;}")
    .replace('Descarga o restaura los datos guardados en este navegador.', 'Descarga un respaldo completo o importa datos al servidor D1.')
    .replace('Restaura datos desde un respaldo de este mismo prototipo.', 'Importa un respaldo compatible. Revisa su contenido antes de reemplazar datos en D1.')
    .replace(/function pdfStore\(mode,operation\)\{[^\n]+/, 'function pdfStore(mode,operation){return cloudPdfStore(mode,operation)}')
    .replace('El PDF no está disponible en este navegador. Puedes adjuntarlo de nuevo.', 'El PDF no está disponible en D1. Adjunta de nuevo la copia original.')
    .replace('<strong>Importar respaldo</strong>', '<strong>Importar respaldo</strong><p><button class="btn btn-outline" id="cloud-local-review" type="button">Revisar copia anterior de este navegador</button></p>')
    .replace('Acceso de prueba', 'Acceso privado')
    .replace('Prueba de interfaz', 'Servidor Cloudflare D1')
    .replace('</head>', '<script src="/acceso-nube.js"></script><style>#lotigest-cloud-status{position:fixed;bottom:8px;left:8px;right:8px;z-index:10000;background:#164532;color:#fff;padding:8px 12px;border-radius:8px;font:13px system-ui;box-shadow:0 2px 10px #0003}#lotigest-cloud-status[data-error=true]{background:#6b291c}#lotigest-cloud-status button{margin:2px 4px;padding:4px 8px;border:1px solid #ffffff60;border-radius:5px;background:transparent;color:inherit;cursor:pointer}body{padding-bottom:55px}body:has(.modal-cover) #lotigest-cloud-status{display:none}@media print{#lotigest-cloud-status{display:none!important}}</style></head>');
  if (demo === html || !demo.includes('lotigest_cloudflare_demo_v1') ||
      !demo.includes('if (cloudflareDemo) return;') || !demo.includes('const pagesContractOcr = true;')) {
    throw new Error('No se pudo aislar el modo de demostración.');
  }
  if (demo.includes("d.get('password')==='admin123'") || demo.includes('localStorage.setItem(STORAGE,') || !demo.includes('setTimeout(cloudBoot,0)')) throw new Error('Integración D1 incompleta.');
  return {
    'index.html': demo,
    'version.json': version,
    'payment-fields.mjs': parser,
    '_headers': '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n',
    '_redirects': '/prueba-diseno-v08.html / 302\n',
  };
}
