export function buildPagesFiles(html, version, parser, bridge) {
  const mode = "const clientMapOrigin =";
  const ocr = "const pagesContractOcr =";
  const title = /<title>[^<]*<\/title>/;
  if (!html.includes(mode) || !html.includes(ocr) || !title.test(html) ||
      !html.includes("import('./payment-fields.mjs')") || !parser.includes('export function extractPaymentFields')) {
    throw new Error('La demo cambió. Revisa los archivos de entrada para Pages.');
  }
  if (!bridge?.includes('async function cloudLoad(')) throw new Error('Falta el puente D1.');
  const release = JSON.parse(version).version;
  if (!/^\d+\.\d+\.\d+$/.test(release) || !html.includes("CURRENT_VERSION='" + release + "'")) {
    throw new Error('El HTML y version.json deben declarar la misma versión.');
  }
  const demo = html
    .replaceAll('db.residences.map(r=>', 'db.residences.filter(r=>!r.hidden).map(r=>')
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
    .replace('<strong>Importar respaldo</strong>', '<strong>Importar respaldo</strong><p><button class="btn btn-outline" id="cloud-local-review" type="button">Revisar copia anterior de este navegador</button> <button class="btn btn-outline" id="cloud-recovery-copies" type="button">Copias de recuperación</button></p>')
    .replace("backup:['Respaldo','download']};", "backup:['Respaldo','download'],help:['Guía de uso','bookClock']};")
    .replace("function basePageContent(){switch(page){", "function basePageContent(){if(page==='help')return cloudHelpPage();switch(page){")
    .replace('Personaliza los datos de la empresa y el comportamiento del prototipo.', 'Configura los datos y la apariencia de tu lotificadora.')
    .replace('Prototipo Fase 2', 'Versión conectada a Cloudflare')
    .replace('La base de datos compartida, los permisos por usuario y el mapa GPS estarán disponibles en fases posteriores. Este prototipo guarda datos en el navegador utilizado.', 'Los registros se guardan en Cloudflare D1. Espera la confirmación de guardado antes de cerrar. El panel integrado requiere una cuenta administradora.')
    .replace('function collectionPage(){', 'function baseCollectionPage(){')
    .replace('function dashboard(){', 'function baseDashboard(){')
    .replace('function viewClient(id){', 'function baseViewClient(id){')
    .replace('<button class="btn btn-outline" data-action="debt-csv">', '<button class="btn btn-primary" data-action="ledger-import">Importar Excel de pagos</button><button class="btn btn-outline" data-action="debt-csv">')
    .replace('function settingsPage(){return `${documentLogoSettings()}', 'function settingsPage(){return `${cadastreSettings()}${documentLogoSettings()}')
    .replace(/function solarSavedMeasurements\(l\)\{[^\n]+/, 'function solarSavedMeasurements(l){return officialMeasures(l)}')
    .replace('function residenceRoadMarkup(){let r=residence();', 'function residenceRoadMarkup(){let r=residence();if(r.officialPlan?.background||r.officialPlan?.backgroundKey){const box=r.officialPlan.viewBox;return `<image href="${esc(officialBackground(r))}" x="${box[0]}" y="${box[1]}" width="${box[2]}" height="${box[3]}" preserveAspectRatio="none"/>`;}')
    .replace('.ar-solar{cursor:pointer;outline:none}', '.ar-solar{cursor:pointer;outline:none}.ar-solar polygon{fill-opacity:.35}.ar-solar:hover polygon,.ar-solar:focus polygon{fill-opacity:.7}')
    .replace('function planSolarAction(data){let lot=getLot(data.lotId);', 'function planSolarAction(data){let lot=getLot(data.lotId);if(lot?.historyRequiresReview)throw Error("Este terreno tiene historial importado por completar. Revisa su contrato antes de registrar otra venta.");')
    .replace("l.status==='available'&&Number(l.price)>0&&Number(l.area)>0", "l.status==='available'&&!l.historyRequiresReview&&Number(l.price)>0&&Number(l.area)>0")
    .replace("L.control.layers({'Calles", "if(cfg.referencePoint)L.marker(cfg.referencePoint).addTo(geoMap).bindPopup('El Arrayán · Referencia de ubicación. Los límites GPS no están georreferenciados por este punto.');L.control.layers({'Calles")
    .replace('function newPayment(saleId, useOcr=false){', 'function baseNewPayment(saleId, useOcr=false){')
    .replace('function receiptsPage(){', 'function baseReceiptsPage(){')
    // Conservar folio del recibo original y proteger contra importación duplicada.
    .replace("const groupId=uid('RC'),next=JSON.parse(JSON.stringify(db)),stamp=new Date().toISOString();",
      "const originalRef=String(d.receiptRef||'').trim();if(originalRef.length>80)throw Error('Folio demasiado largo.');if(originalRef&&db.payments.some(p=>String(p.receiptReference||'').trim().toUpperCase()===originalRef.toUpperCase()&&getLot(getSale(p.saleId)?.lotId)?.residenceId===residence().id))throw Error('Este folio ya existe en un pago de esta residencial. Revisa el historial.');if(originalRef&&(db.ownerPayments||[]).some(p=>p.residenceId===residence().id&&String(p.receiptReference||'').trim().toUpperCase()===originalRef.toUpperCase()))throw Error('Este folio ya existe entre los abonos de propietarios.');if(originalRef&&(db.historicalPayments||[]).some(p=>p.residenceId===residence().id&&String(p.receiptReference||p.sourceRaw?.receiptRef||p.sourceRaw?.folio||'').trim().toUpperCase()===originalRef.toUpperCase()))throw Error('El folio ya existe en el historial importado.');const groupId=uid('RC'),next=JSON.parse(JSON.stringify(db)),stamp=new Date().toISOString();")
    .replace("method:String(d.method||'').trim().slice(0,80),recordedAt:stamp",
      "method:String(d.method||'').trim().slice(0,80),receiptReference:originalRef,recordedAt:stamp")

    .replace('function financeMovements(){', 'function baseFinanceMovements(){')
    .replace('function totals(){', 'function baseTotals(){')
    .replace('function paymentReceiptPreview(id){', 'function basePaymentReceiptPreview(id){')
    .replace('return db.sales.filter(s=>getLot(s.lotId)?.residenceId===paymentDraft?.residenceId&&balance(s)>.009)', 'return db.sales.filter(s=>getLot(s.lotId)?.residenceId===paymentDraft?.residenceId&&(!paymentDraft.clientId||s.clientId===paymentDraft.clientId)&&balance(s)>.009)')
    .replace('function viewLot(id){', 'function baseViewLot(id){')
    .replace(/\$\{list\.filter\(x=>x\.lot\.residenceId===st\)\.map\(x=>`[\s\S]*?\.join\(''\)\}/, '${collectionSolarCards(list.filter(x=>x.lot.residenceId===st),st)}')
    .replace('Los cuadros muestran el inventario por residencial; no representan su ubicación geográfica.', 'Cada ficha reúne al propietario, sus solares y sus pagos. Las referencias de Excel con código pendiente se agrupan sin modificar el inventario del mapa.')
    .replace('function render(){', 'function renderBase(){')
    .replace('function openSolarWindow(lotId){', "function openSolarWindow(lotId){if(cloudUser?.role==='sales'){lotClientCard(lotId);return;}")
    .replace('function baseViewLot(id){', "function baseViewLot(id){if(cloudUser?.role==='sales'){lotClientCard(id);return;}")
    .replace('function basePageContent(){', "function basePageContent(){if(cloudUser?.role==='sales'&&page==='dashboard')return sellerDashboard();")
    .replace('function editLot(id){', 'function baseEditLot(id){')
    .replace('let obj={id,dimensions,residenceId:', "let obj={id,dimensions,...(data.areaVerified==='on'?{areaVerified:true,areaOrigin:'confirmed-by-admin'}:{}),residenceId:")
    .replace('Acceso de prueba', 'Acceso privado')
    .replace('Prueba de interfaz', 'Servidor Cloudflare D1')
    .replace('</head>', '<script src="/acceso-nube.js"></script><script src="/offline-files.js"></script><script src="/lotigestLedger.js"></script><script src="/lotigestCadastre.js"></script><script src="/lotigestOwnerPayments.js"></script><link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#164532"><style>#lotigest-cloud-status{position:fixed;bottom:54px;right:12px;max-width:390px;width:calc(100% - 24px);z-index:10000;box-sizing:border-box;background:#164532;color:#fff;padding:14px 36px 14px 14px;border-radius:12px;font:13px system-ui;box-shadow:0 3px 18px #0004}#lotigest-cloud-status[hidden]{display:none!important}#lotigest-cloud-status[data-error=true]{background:#6b291c}#lotigest-cloud-status button{margin:6px 4px 0 0;padding:5px 8px;border:1px solid #ffffff60;border-radius:5px;background:transparent;color:inherit;cursor:pointer}#lotigest-cloud-status .cloud-notice-close{position:absolute;right:6px;top:2px;font-size:20px;border:0;margin:0}#lotigest-sync-indicator{position:fixed;bottom:10px;right:12px;z-index:9999;border:0;border-radius:20px;padding:8px 12px;background:#164532;color:#fff;box-shadow:0 2px 8px #0003;font:12px system-ui;cursor:pointer}body:has(.modal-cover) #lotigest-cloud-status,body:has(.modal-cover) #lotigest-sync-indicator{display:none}@media print{#lotigest-cloud-status,#lotigest-sync-indicator{display:none!important}}</style></head>');
  if (demo === html || !demo.includes('lotigest_cloudflare_demo_v1') ||
      !demo.includes('if (cloudflareDemo) return;') || !demo.includes('const pagesContractOcr = true;')) {
    throw new Error('No se pudo aislar el modo de demostración.');
  }
  if (demo.includes("d.get('password')==='admin123'") || demo.includes('localStorage.setItem(STORAGE,') || !demo.includes('setTimeout(cloudBoot,0)')) throw new Error('Integración D1 incompleta.');
  return {
    'index.html': demo,
    'version.json': version,
    'payment-fields.mjs': parser,
    '_headers': '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Frame-Options: DENY\n  Content-Security-Policy: frame-ancestors \'none\'; base-uri \'self\'; object-src \'none\'\n',
    '_redirects': '/prueba-diseno-v08.html / 302\n',
  };
}
