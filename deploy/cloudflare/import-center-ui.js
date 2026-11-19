// LOTIGEST · Ventana única de importaciones.
// Reutiliza validaciones ya existentes. Nunca guarda registros sin la confirmación explícita.
const importHubModes={
 measures:{title:'Medidas y precios',tip:'Actualizar áreas, varas y precios de solares existentes. No modifica propietarios ni pagos.',accept:'.xlsx',max:12,preview:'lot-measures-preview',confirm:'lot-measures-confirm',action:'lot-measures-confirm'},
 buyers:{title:'Clientes y compras',tip:'Vincular comprador, identidad, etapa, bloque, solar, prima y contrato por fila. Varias compras del mismo cliente van en filas diferentes.',accept:'.xlsx',max:12,preview:'buyer-import-preview',confirm:'buyer-import-confirm',action:'buyer-import-confirm'},
 payments:{title:'Primas y abonos',tip:'Cargar historial: fecha, cliente, etapa, bloque, solares y monto. Se revisan duplicados; el historial no se convierte automáticamente en un cobro nuevo.',accept:'.xlsx',max:15,preview:'ledger-preview',confirm:'ledger-confirm',action:'ledger-confirm'},
 map:{title:'Croquis PDF',tip:'Adjuntar croquis por residencial. El PDF no asigna automáticamente dueños ni precios: revisa las medidas y conserva los solares existentes.',accept:'.pdf,.json',max:20},
 contracts:{title:'Documentos de contratos',tip:'Selecciona primero el cliente y su solar. Después puedes adjuntar hasta tres fotos para reconocer el texto del contrato.',accept:'.jpg,.jpeg,.png,.webp'}
};
const importHubPanelModes={
 dashboard:'buyers',residences:'map',arrayan:'map',gps:'map',design:'map',
 lots:'measures',clients:'buyers',sales:'buyers',collections:'payments',payments:'payments',
 receipts:'payments',contracts:'contracts',pending:'buyers',reports:'payments',
 finance:'payments',settings:'measures'
};
let importHubCurrentMode=null;
function importHubIsAdmin(){return !!(cloudReady&&cloudUser?.role==='admin'&&sessionStorage.getItem(SESSION)==='yes');}
function importHubResetPreview(){
 lotImportPreview=null;buyerImportPreview=null;ledgerPreview=null;
 lotImportReadVersion++;buyerImportReadVersion++;ledgerReadVersion++;
}
function importHubModesMarkup(selected){
 return '<div class="import-hub-tabs" role="group" aria-label="Tipo de información" style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">'+
 Object.entries(importHubModes).map(([key,mode])=>'<button class="btn '+(selected===key?'btn-primary':'btn-outline')+'" type="button" data-import-hub-mode="'+key+'" aria-pressed="'+(selected===key)+'">'+esc(mode.title)+'</button>').join('')+'</div>';
}
function importHubTemplate(mode){
 if(!importHubIsAdmin())throw Error('Solo el administrador puede descargar o importar datos.');
 if(mode==='measures')return downloadExcel('Plantilla_terrenos_y_medidas.xlsx',['Codigo','Bloque','Numero','Tipo','Area_m2','Precio','Frente','Fondo','Lateral_izquierdo','Lateral_derecho'],[]);
 if(mode==='buyers')return downloadExcel('Plantilla_clientes_compras.xlsx',buyerColumns,[]);
 if(mode==='payments')return ledgerExcelTemplate();
}
function importHubOpen(requested){
 if(!importHubIsAdmin()){toast('Solo el administrador puede importar datos.','error');return;}
 importHubResetPreview();
 const mode=Object.hasOwn(importHubModes,requested)?requested:importHubPanelModes[page]||'measures';
 importHubCurrentMode=mode;
 const config=importHubModes[mode];
 const kind=['measures','buyers','payments'].includes(mode);
 const previewId=config.preview||'import-hub-message';
 const accept=config.accept;
 const tips='<p class="sm muted" style="margin:8px 0 14px">'+esc(config.tip)+'</p>';
 const tabs=importHubModesMarkup(mode);
 const file=mode==='contracts'
  ?'<div class="card" style="padding:16px"><strong>Relacionar el documento antes de leerlo</strong><p class="sm muted">Busca por nombre o identidad al cliente y selecciona el solar. Las fotos se usan para OCR; el sistema conserva el texto revisado, no la fotografía original.</p><button type="button" class="btn btn-primary" data-import-hub-contract>Elegir cliente y escanear contrato</button></div>'
  :'<div class="card" style="padding:16px"><label for="import-hub-file" style="display:block;font-weight:650;margin-bottom:8px">Archivo de '+esc(config.title.toLowerCase())+'</label>'+
    '<input id="import-hub-file" type="file" accept="'+esc(accept)+'" style="display:block;width:100%;max-width:100%;min-width:0" aria-describedby="import-hub-file-help">'+
    '<p id="import-hub-file-help" class="sm muted">Formatos permitidos: '+esc(accept)+' · '+config.max+' MB máximo.</p></div>';
 const template=kind?'<button type="button" class="btn btn-outline" data-import-hub-template="'+mode+'">Descargar plantilla Excel (.xlsx)</button>':'';
 const content='<p><b>Residencial:</b> '+esc(residence().name)+' · <b>Origen:</b> '+esc(pages[page]?.[0]||'LOTIGEST')+'</p>'+tabs+tips+file+
  '<div id="'+previewId+'" role="status" aria-live="polite" style="margin-top:16px;max-height:340px;overflow:auto"></div>'+
  '<p class="sm muted" style="margin-top:14px">Primero se lee el archivo, luego se muestra la vista previa y los errores. Solo tú puedes confirmar. No reemplaza contratos, ventas ni abonos existentes sin revisión.</p>';
 const confirm=kind?'<button type="button" class="btn btn-primary" id="'+config.confirm+'" data-action="'+config.action+'" disabled>Confirmar importación</button>':'';
 const footer=template+'<button type="button" class="btn btn-soft" data-action="close-modal">Cerrar</button>'+confirm;
 showModal('Centro de importaciones',content,footer,true,config.title);
 const input=document.getElementById('import-hub-file');
 if(input)input.value='';
}
async function importHubFile(file){
 if(!importHubIsAdmin())throw Error('Sesión sin autorización para importar.');
 if(!file)return;
 const mode=importHubCurrentMode,config=importHubModes[mode];
 if(!config||mode==='contracts')throw Error('Elige el tipo de archivo correcto.');
 const extensions=config.accept.split(',');
 const ok=extensions.some(ext=>file.name.toLowerCase().endsWith(ext));
 if(!ok)throw Error('Archivo incompatible con '+config.title+'. Se acepta '+config.accept+'.');
 if(file.size>config.max*1024*1024)throw Error('El archivo supera '+config.max+' MB.');
 if(mode==='measures')return previewLotMeasures(file);
 if(mode==='buyers')return previewBuyerImport(file);
 if(mode==='payments')return readLedgerFile(file);
 if(mode==='map')return importResidentialMap(file);
}
const importHubHeaderBase=header;
header=function(title,subtitle,actions='',kicker){
 const menu=['dashboard','residences','arrayan','gps','design','lots','clients','sales','collections','payments','contracts','receipts','reports','finance','settings'];
 if(menu.includes(page)&&importHubIsAdmin()){
  actions+='<button type="button" class="btn btn-outline" data-import-hub-open="true">Importar / documentos</button>';
 }
 return importHubHeaderBase(title,subtitle,actions,kicker);
};
// Un solo punto de entrada, incluso para botones antiguos de los distintos paneles.
document.addEventListener('click',event=>{
 const target=event.target.closest?.('[data-import-hub-open],[data-import-hub-mode],[data-import-hub-template],[data-import-hub-contract],[data-action="lot-measures-import"],[data-action="buyer-import"],[data-action="ledger-import"]');
 if(!target)return;
 event.preventDefault();event.stopImmediatePropagation();
 if(target.hasAttribute('data-import-hub-template')){
  try{importHubTemplate(target.dataset.importHubTemplate);}catch(e){toast(e.message,'error');}
  return;
 }
 if(target.hasAttribute('data-import-hub-contract')){
  if(!importHubIsAdmin()){toast('Acceso no autorizado.','error');return;}
  return chooseContractScanClient();
 }
 if(target.dataset.importHubMode){
  return importHubOpen(target.dataset.importHubMode);
 }
 const action=target.dataset.action;
 return importHubOpen(action==='buyer-import'?'buyers':action==='lot-measures-import'?'measures':action==='ledger-import'?'payments':importHubPanelModes[page]);
},true);
document.addEventListener('change',event=>{
 if(event.target.id!=='import-hub-file')return;
 event.stopImmediatePropagation();
 const input=event.target,file=input.files?.[0];
 if(!file)return;
 const output=document.getElementById(importHubModes[importHubCurrentMode]?.preview||'import-hub-message');
 Promise.resolve().then(()=>importHubFile(file)).catch(e=>{if(output)output.textContent=e.message;toast(e.message,'error');});
},true);
