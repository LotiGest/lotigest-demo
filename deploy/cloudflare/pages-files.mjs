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
  const sidebarCollapseCss = "/* El menú solamente se expande al pulsar el botón, no por el :hover persistente de Android. */\nbody .lotigest-shell .lotigest-sidebar:not(.pinned),\nbody[data-panel-theme] .lotigest-shell .lotigest-sidebar:not(.pinned),\nbody.sidebar-collapsed[data-panel-theme] .lotigest-shell .lotigest-sidebar:not(.pinned){\n width:var(--lg-side-small)!important;flex-basis:var(--lg-side-small)!important\n}\nbody .lotigest-shell .lotigest-sidebar:not(.pinned) .lg-side-label,\nbody .lotigest-shell .lotigest-sidebar:not(.pinned) .lg-nav .nav-btn em,\nbody .lotigest-shell .lotigest-sidebar:not(.pinned) .lg-product small{\n display:none!important;opacity:0!important\n}\nbody .lotigest-shell .lotigest-sidebar:not(.pinned) .lg-company{gap:0!important}\nbody .lotigest-shell .lotigest-sidebar:not(.pinned) .lg-company-icon{\n width:29px!important;height:29px!important;flex-basis:29px!important;font-size:15px!important\n}\nbody .lotigest-shell .lotigest-sidebar:not(.pinned) .lg-side-head{gap:2px!important}\nbody .lotigest-shell .lotigest-sidebar:not(.pinned) .lg-nav .nav-btn{\n justify-content:center!important;padding:0!important;gap:0!important\n}\nbody .lotigest-shell .lotigest-sidebar .lg-pin{\n display:grid!important;place-items:center!important;opacity:1!important;pointer-events:auto!important;\n min-width:25px;width:25px;height:27px;padding:0!important;cursor:pointer;touch-action:manipulation;\n font-size:15px;line-height:1;flex:none!important\n}\nbody .lotigest-shell .lotigest-sidebar:not(.pinned) .lg-pin{\n min-width:19px!important;width:19px!important;height:24px!important;font-size:12px\n}\nbody .lotigest-shell .lotigest-sidebar .lg-pin:focus-visible{outline:2px solid #baff58;outline-offset:2px}";
  const demo = html
    .replaceAll('db.residences.map(r=>', 'db.residences.filter(r=>!r.hidden).map(r=>')
    .replace(title, '<title>LOTIGEST · GRUPO H</title>')
    .replace("const STORAGE='lospinos_phase1_demo_v3'; const SESSION='lospinos_demo_session';",
      "const STORAGE='lotigest_cloudflare_demo_v1'; const SESSION='lotigest_cloudflare_session';")
    .replace(mode, "const cloudflareDemo = true;\n" + mode)
    .replace("const clientMapOrigin = 'https://henriquez-mapa-clientes.julyip97.chatgpt.site';", "const clientMapOrigin = location.origin;")
    .replace(/const pagesContractOcr = [^;\n]+;/, 'const pagesContractOcr = true;')
    .replace("document.head.append(adaptiveStyle);","if(adaptiveStyle) document.head.append(adaptiveStyle);")
    .replace('</head>', '<style>.lotigest-demo-banner{padding:.55rem 1rem;background:#164532;color:white;text-align:center;font:600 .875rem system-ui}@media print{.lotigest-demo-banner{display:none!important}}</style></head>')
    .replace(/localStorage\.setItem\(STORAGE,/g, 'cloudWrite(')
    .replace('let db,storedLotigest;', 'const CLOUD_BUILD_VERSION='+JSON.stringify(release)+';\n'+bridge + '\nlet db,storedLotigest;')
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
    .replace("async function confirmClientReservation(id){", "async function confirmClientReservation(id){let reservationSaved=false;")
    .replace("await clientSalesApi('requests/'+id,'PATCH',{status:'approved'});", "await cloudFlush();if(cloudBlocked||cloudBusy||cloudQueue?.pending||cloudQueue?.latest!==cloudQueue?.confirmed)throw Error('El apartado todavía no se ha confirmado en la nube; conserva tu copia pendiente y reintenta.');reservationSaved=true;await clientSalesApi('requests/'+id,'PATCH',{status:'approved'});")
    .replace("}catch(error){db=JSON.parse(previous);try{localStorage.setItem(STORAGE,previous);}catch{}toast(error.message,'error');}", "}catch(error){if(!reservationSaved){db=JSON.parse(previous);try{localStorage.setItem(STORAGE,previous);}catch{}}else{toast('El apartado ya fue guardado. Actualiza Pendientes para conciliar su estado.','error');return;}toast(error.message,'error');}")
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
    .replace("toast('Pagos registrados. Recibo listo para descargar o compartir.');", '')
    // Cada PDF de pago contiene un QR vectorial que apunta a la verificación pública.
    .replace("function receiptLetterPdf(parts,company,reference,kind='receipt'){",
      "function receiptLetterPdf(parts,company,reference,kind='receipt',qrUrl=null){")
    .replace("const footer=()=>{\n if(kind!=='quote')",
      "const footer=()=>{\n if(qrUrl)cmds.push(receiptQrVector(qrUrl));\n if(kind!=='quote')")
    .replace("draw('PAGO RECIBIDO',430,126,12,true,green);",
      "draw('PAGO RECIBIDO',qrUrl?319:430,126,12,true,green);")
    .replace("draw('Gracias por su pago',44,126,12,true,navy);",
      "draw('Gracias por su pago',44,126,12,true,navy);if(qrUrl)draw('VERIFICAR QR',471,124,7,true,navy);")
    .replace("if(y-size<151){footer();header();}", "if(y-size<(qrUrl?233:151)){footer();header();}")
    .replace("return {blob:receiptLetterPdf(parts,db.company.name||'Lotificadora Henríquez',ref),",
      "return {blob:receiptLetterPdf(parts,db.company.name||'Lotificadora Henríquez',ref,'receipt',receiptQrUrl('payment',id)),")
    // No salir de Cuotas y pagos al registrar recibos; el comprobante abre sobre el panel actual.
    .replace("paymentDraft=null;closeModal();filter='';page='receipts';render();paymentReceiptPreview(payments[0].id);",
      "paymentDraft=null;closeModal();filter='';render();paymentReceiptPreview(payments[0].id);")
    .replace("db=next;closeModal();filter='';page='receipts';render();toast('Pago registrado y recibo creado');",
      "db=next;closeModal();filter='';render();toast('Pago registrado y recibo creado');")
    .replace('return db.sales.filter(s=>getLot(s.lotId)?.residenceId===paymentDraft?.residenceId&&balance(s)>.009)', 'return db.sales.filter(s=>getLot(s.lotId)?.residenceId===paymentDraft?.residenceId&&(!paymentDraft.clientId||s.clientId===paymentDraft.clientId)&&balance(s)>.009)')
    .replace('function viewLot(id){', 'function baseViewLot(id){')
    .replace(/\$\{list\.filter\(x=>x\.lot\.residenceId===st\)\.map\(x=>`[\s\S]*?\.join\(''\)\}/, '${collectionSolarCards(list.filter(x=>x.lot.residenceId===st),st)}')
    .replace('Los cuadros muestran el inventario por residencial; no representan su ubicación geográfica.', 'Cada ficha reúne al propietario, sus solares y sus pagos. Las referencias de Excel con código pendiente se agrupan sin modificar el inventario del mapa.')
    // La barra muestra íconos y nombres desde el primer ingreso en escritorio.
    // Nueva preferencia: las barras antiguas contraídas no ocultan los nombres.
    .replaceAll("'lotigest-v08-pin'", "'lotigest-v08-pin-labels-v1'")
    .replace("pinned?'Desfijar barra lateral':'Fijar barra lateral'", "pinned?'Minimizar menú':'Expandir menú'")
    .replace('aria-label="Fijar barra lateral"', 'aria-label="Expandir o minimizar menú" aria-expanded="${pinned}"')
    .replace("${pinned?'◆':'♧'}", "${pinned?'«':'»'}")
    .replace("btn.textContent=next?'◆':'♧';",
      "btn.textContent=next?'«':'»';btn.setAttribute('aria-expanded',String(next));btn.setAttribute('aria-label',next?'Minimizar menú':'Expandir menú');btn.title=next?'Minimizar menú':'Expandir menú';")
    .replace("const pinned=localStorage.getItem('lotigest-v08-pin-labels-v1')==='true';",
      "const pinned=localStorage.getItem('lotigest-v08-pin-labels-v1')!=='false';")
    .replace("const next=localStorage.getItem('lotigest-v08-pin-labels-v1')!=='true';",
      "const next=localStorage.getItem('lotigest-v08-pin-labels-v1')==='false';")
    .replace('function render(){', 'function renderBase(){')
    .replace('function openSolarWindow(lotId){', "function openSolarWindow(lotId){if(cloudUser?.role==='sales'){lotClientCard(lotId);return;}")
    .replace('function baseViewLot(id){', "function baseViewLot(id){if(cloudUser?.role==='sales'){lotClientCard(id);return;}")
    .replace('function basePageContent(){', "function basePageContent(){if(cloudUser?.role==='sales'&&page==='dashboard')return sellerDashboard();")
    .replace('function editLot(id){', 'function baseEditLot(id){')
    .replace('let obj={id,dimensions,residenceId:', "let obj={id,dimensions,...(data.areaVerified==='on'?{areaVerified:true,areaOrigin:'confirmed-by-admin'}:{}),residenceId:")
    .replace('data-page="settings">⚙ Configuración</button>', 'data-page="settings">⚙ Configuración</button><button class="lg-popup-action" type="button" data-action="cloud-manual-update">↻ Actualizar LOTIGEST</button>')
    // La ventana de actualización antigua y su revisión periódica se sustituyen por el botón manual.
    .replace(/<script id="lotigest-update-checker">[\s\S]*?<\/script>/, '')
    // Versión visible para distinguir una instalación anterior de la publicación nueva.
    .replace('<span>GRUPO H / LOTIGEST</span>', '<span>GRUPO H / LOTIGEST <small class="lg-version">v${CLOUD_BUILD_VERSION}</small></span>')
    .replace('Acceso de prueba', 'Acceso privado')
    .replace('Prueba de interfaz', 'Servidor Cloudflare D1')
    .replace('</head>', '<style id="lg-sidebar-collapse-fix">'+sidebarCollapseCss+'</style></head>')
    .replace('</head>', '<script src="/acceso-nube.js"></script><script src="/offline-files.js"></script><script src="/lotigestLedger.js"></script><script src="/lotigestCadastre.js"></script><script src="/lotigestOwnerPayments.js"></script><link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#164532"><style>#lotigest-cloud-status{position:fixed;bottom:54px;right:12px;max-width:390px;width:calc(100% - 24px);z-index:10000;box-sizing:border-box;background:#164532;color:#fff;padding:14px 36px 14px 14px;border-radius:12px;font:13px system-ui;box-shadow:0 3px 18px #0004}#lotigest-cloud-status[hidden]{display:none!important}#lotigest-cloud-status[data-error=true]{background:#6b291c}#lotigest-cloud-status button{margin:6px 4px 0 0;padding:5px 8px;border:1px solid #ffffff60;border-radius:5px;background:transparent;color:inherit;cursor:pointer}#lotigest-cloud-status .cloud-notice-close{position:absolute;right:6px;top:2px;font-size:20px;border:0;margin:0}#lotigest-sync-indicator{position:fixed;bottom:10px;right:12px;z-index:9999;border:0;border-radius:20px;padding:8px 12px;background:#164532;color:#fff;box-shadow:0 2px 8px #0003;font:12px system-ui;cursor:pointer}body:has(.modal-cover) #lotigest-cloud-status,body:has(.modal-cover) #lotigest-sync-indicator{display:none}@media print{#lotigest-cloud-status,#lotigest-sync-indicator{display:none!important}}</style></head>');
  if (demo === html || !demo.includes('lotigest_cloudflare_demo_v1') ||
      !demo.includes('const clientMapOrigin = location.origin;') || !demo.includes('const pagesContractOcr = true;')) {
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
