function contractSheetModel(clientId,{documentId='',lotId=''}={}){
 const client=getClient(clientId);if(!client)throw Error('No se encontró el cliente.');
 const document=(db.contractTexts||[]).find(d=>d.id===documentId&&d.clientId===clientId);
 const ids=document?(document.contractLotIds||[document.lotId]):lotId?[lotId]:db.lots.filter(l=>l.residenceId===residence().id&&(l.ownerClientId===clientId||db.sales.some(s=>s.lotId===l.id&&s.clientId===clientId)||(db.contractTexts||[]).some(d=>d.lotId===l.id&&d.clientId===clientId&&d.status!=='voided'))).map(l=>l.id);
 const documents=(db.contractTexts||[]).filter(d=>d.clientId===clientId&&d.status!=='voided');
 const p=document?.structured||documents.find(d=>ids.includes(d.lotId))?.structured||{};
 const present=(...values)=>values.find(v=>v!=null&&String(v).trim()!=='');
 const showMoney=v=>v==null||v===''||!Number.isFinite(Number(v))?'No registrado':money(Number(v));
 const sections=[{title:'GENERALES DE CLIENTE',rows:[['NÚMERO DE CONTRATO',document?.number||documents.find(d=>ids.includes(d.lotId))?.number||'—'],['NOMBRE DE CLIENTE',client.name||p.name],['DNI',client.identity||p.identity],['RTN',client.rtn||p.rtn],['ESTADO CIVIL',client.maritalStatus||p.maritalStatus],['PROFESIÓN U OFICIO',client.occupation||p.occupation],['DIRECCIÓN',client.address||p.address]]}];
 for(const id of [...new Set(ids)]){
  const lot=getLot(id);if(!lot)continue;
  const doc=documents.find(d=>d.lotId===id&&(!document||d.id===document.id||d.contractGroupId&&d.contractGroupId===document.contractGroupId)),fields=doc?.structured||{},sale=db.sales.find(s=>s.lotId===id&&s.clientId===clientId),terms=monthlyLotTerms(db,id);
  const price=sale?.price??fields.price,down=sale?.downPayment??fields.down,months=sale?.months??fields.months;
 const quota=price!=null&&down!=null&&Number(months)>0?Math.round((Number(price)-Number(down))/Number(months)*100)/100:null;
  sections.push({title:'SOBRE LOTE'+(ids.length>1?' - SOLAR '+(lot.sourceNumber||lot.number||lot.id):''),rows:[['ETAPA',lot.stage],['LOTE (S)',lot.sourceNumber||lot.number||lot.id],['BLOQUE (S)',lot.block],['ÁREA (VARAS²)',present(fields.areaVaras,lot.areaVaras2)],['METROS CUADRADOS',present(fields.areaM2,lot.area)]]},
   {title:'COLINDANCIAS',rows:['north','south','east','west'].map((key,i)=>[['NORTE','SUR','ESTE','OESTE'][i],present(fields[key],lot[key],lot.colindancias?.[key],lot.boundaries?.[key],lot.dimensions?.[key])])},
   {title:'DATOS DE VENTA',rows:[['PRECIO DEL LOTE',showMoney(price)],['PRIMA PACTADA',showMoney(down)],['SALDO A FINANCIAR',price!=null&&down!=null?showMoney(Number(price)-Number(down)):'No registrado'],['CUOTA MENSUAL',quota!=null?showMoney(quota)+' MENSUAL':'No registrado'],['TIEMPO DE CONTRATO',months?months+' cuotas / '+(Number(months)/12).toLocaleString('es-HN',{maximumFractionDigits:2})+' años':'No registrado']]});
  const observations=[present(fields.pricePerVara,lot.priceVara2)!=null?'Precio por vara²: '+showMoney(present(fields.pricePerVara,lot.priceVara2)):'',fields.observations||'',fields.documentAreaM2!=null?'Área conjunta de la ficha: '+fields.documentAreaM2+' m² (no representa la medida individual de este solar).':'',fields.documentAreaVaras!=null?'Varas² conjuntas: '+fields.documentAreaVaras:''].filter(Boolean).join(' ');
  sections.push({title:'OBSERVACIONES',rows:[['OBSERVACIONES',observations]]});
 }
 if(!ids.length)sections.push({title:'SOBRE LOTE / DATOS DE VENTA',rows:[['ESTADO','No hay solares vinculados en esta residencial. Completa el contrato para mostrar la cuota mensual.']]});
 const rid=document?.residenceId||getLot(ids[0])?.residenceId||residence().id;
 return {company:db.company?.name||'GRUPO H',residence:residenceName(rid),sections,branding:typeof lgDocumentBranding==='function'?lgDocumentBranding(rid):null};
}
function downloadContractSheet(clientId,options={}){
 if(cloudUser?.role!=='admin')throw Error('Necesitas acceso de administrador para descargar la ficha privada.');
 const model=contractSheetModel(clientId,options),name='Ficha-'+String(getClient(clientId)?.name||clientId).replace(/[^a-zA-Z0-9ÁÉÍÓÚÑáéíóúñ -]/g,'').replace(/\s+/g,'-').slice(0,100)+'.pdf';
 download(name,contractSheetPdf(model),'application/pdf');
}
const sheetBaseDescription=contractIntakeDescription;
contractIntakeDescription=function(doc){return sheetBaseDescription(doc)+'<button type="button" class="btn btn-primary" data-contract-sheet="'+esc(doc.id)+'">Descargar ficha PDF</button> <button type="button" class="btn btn-outline" data-lawyer-sheet="'+esc(doc.id)+'">Enviar ficha al abogado</button>';};
const sheetBaseClient=viewClient;
viewClient=function(id){const result=sheetBaseClient(id);if(cloudUser?.role==='admin')document.querySelector('#modal-root .modal-footer')?.insertAdjacentHTML('afterbegin','<button type="button" class="btn btn-outline" data-client-sheet="'+esc(id)+'">Descargar ficha PDF</button>');return result;};
const sheetBaseSale=viewSale;
viewSale=function(id){const result=sheetBaseSale(id),sale=getSale(id);if(sale&&cloudUser?.role==='admin')document.querySelector('#modal-root .modal-footer')?.insertAdjacentHTML('afterbegin','<button type="button" class="btn btn-outline" data-client-sheet="'+esc(sale.clientId)+'" data-sheet-lot="'+esc(sale.lotId)+'">Descargar ficha PDF</button>');return result;};
document.addEventListener('click',event=>{
 const button=event.target.closest?.('[data-contract-sheet],[data-client-sheet]');if(!button)return;
 event.preventDefault();event.stopImmediatePropagation();
 try{const doc=(db.contractTexts||[]).find(d=>d.id===button.dataset.contractSheet);downloadContractSheet(doc?.clientId||button.dataset.clientSheet,{documentId:doc?.id||'',lotId:button.dataset.sheetLot||''});}catch(error){toast(error.message,'error');}
},true);

function lawyerPhone(value){const raw=String(value||'').trim();if(!raw)return '';if(!/^\+?[\d ()-]+$/.test(raw))return '';let n=raw.replace(/\D/g,'');if(n.length===8)n='504'+n;return /^[1-9]\d{7,14}$/.test(n)?n:'';}
function lawyerContact(rid){return db.company?.lawyerContacts?.[rid]||{name:'',phone:''};}
function lawyerSheetName(doc){return 'Ficha-contractual-'+String(doc.number||doc.id).replace(/[^a-zA-Z0-9_-]/g,'')+'.pdf';}
function lawyerSheetOpen(id){
 if(!contractIntakeAdmin())throw Error('Se requiere administrador con guardado confirmado.');
 const doc=contractManageRecord(id);if(!doc)throw Error('No se encontró la ficha vigente.');
 const model=contractSheetModel(doc.clientId,{documentId:id}),contact=lawyerContact(doc.residenceId);
 const required=new Set(['NORTE','SUR','ESTE','OESTE','ÁREA (VARAS²)','METROS CUADRADOS','ESTADO CIVIL','DIRECCIÓN']);
 const missing=model.sections.flatMap(g=>g.rows.filter(([k,v])=>required.has(k)&&(v==null||String(v).trim()==='')).map(([k])=>k));
 const ids=doc.contractLotIds||[doc.lotId];
 const edits=(db.contractTexts||[]).filter(d=>d.clientId===doc.clientId&&ids.includes(d.lotId)&&d.status!=='voided').map(d=>'<button type="button" class="btn btn-outline btn-sm" data-lawyer-edit="'+esc(d.id)+'">Editar solar '+esc(getLot(d.lotId)?.sourceNumber||d.lotId)+'</button>').join(' ');
 showModal('Ficha guardada · Enviar al abogado','<p><strong>Ficha contractual lista para revisión.</strong> El PDF contiene los datos del cliente y los solares guardados.</p>'+
 (missing.length?'<p class="notice-card">Datos por completar: '+esc([...new Set(missing)].join(', '))+'. Revisa antes de enviar.</p>':'')+
 '<div>'+edits+'</div><label>Abogado / destinatario<input id="lawyer-sheet-phone" type="tel" value="'+esc(contact.phone||'')+'" placeholder="+504 9999-9999"></label>'+
 '<small>Contacto configurado: '+esc(contact.name||'Sin nombre')+'. Confirma el destinatario antes de compartir.</small>'+
 '<div style="margin:12px 0;padding:14px;border:1px solid #b7c6bf;border-radius:8px">'+
 (typeof lgDocumentBrandHtml==='function'?lgDocumentBrandHtml(doc.residenceId):'')+
 '<h3 style="text-align:center">'+esc(model.residence)+'</h3>'+model.sections.map(g=>'<h4 style="text-align:center;margin:12px 0 6px">'+esc(g.title)+'</h4><table style="width:100%;border-collapse:collapse">'+g.rows.map(([k,v])=>'<tr><td style="border:1px solid #b7c6bf;padding:5px;width:40%;font-size:12px"><b>'+esc(k)+'</b></td><td style="border:1px solid #b7c6bf;padding:5px;font-size:12px;overflow-wrap:anywhere">'+esc(v==null||v===''?'No registrado':v)+'</td></tr>').join('')+'</table>').join('')+'<h4 style="text-align:center">FIRMA DE AUTORIZACIÓN</h4><div style="height:45px;border:1px solid #b7c6bf"></div></div>',
 '<button type="button" class="btn btn-outline" data-contract-sheet="'+esc(id)+'">Descargar PDF</button><button type="button" class="btn btn-primary" data-lawyer-send="'+esc(id)+'">Enviar por WhatsApp</button>',true);
}
async function lawyerSheetSend(id){
 if(!contractIntakeAdmin())throw Error('Necesitas acceso de administrador y datos sincronizados.');
 const doc=contractManageRecord(id);if(!doc)throw Error('La ficha ya no está vigente.');
 const phone=lawyerPhone(document.getElementById('lawyer-sheet-phone')?.value);if(!phone)throw Error('Ingresa el número correcto del abogado.');
 if(!confirm('¿Compartir la ficha privada del cliente con el abogado +'+phone+'? Confirma que es el destinatario autorizado.'))return;
 const model=contractSheetModel(doc.clientId,{documentId:id}),blob=contractSheetPdf(model),name=lawyerSheetName(doc);
 const msg='Buen día. Le compartimos la ficha de generales del cliente y condiciones del solar para preparar el contrato correspondiente. Por favor, revise los datos y cualquier información pendiente. Muchas gracias.';
 if(typeof File==='function'&&navigator.canShare?.({files:[new File([blob],name,{type:'application/pdf'})]})){
  try{await navigator.share({files:[new File([blob],name,{type:'application/pdf'})],title:'Ficha contractual LOTIGEST',text:msg+' Destinatario autorizado: +'+phone});return;}catch(e){if(e.name==='AbortError')return;}
 }
 download(name,blob,'application/pdf');window.open('https://wa.me/'+phone+'?text='+encodeURIComponent(msg),'_blank','noopener,noreferrer');toast('Adjunta el PDF descargado en el chat del abogado.');
}
document.addEventListener('click',e=>{
 const b=e.target.closest?.('[data-lawyer-sheet],[data-lawyer-send],[data-lawyer-edit]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();
 try{if(b.dataset.lawyerSend)lawyerSheetSend(b.dataset.lawyerSend).catch(err=>toast(err.message,'error'));else if(b.dataset.lawyerEdit)contractManageEditOpen(b.dataset.lawyerEdit);else lawyerSheetOpen(b.dataset.lawyerSheet);}catch(err){toast(err.message,'error');}
},true);
const lawyerSettingsBase=settingsPage;
settingsPage=function(){
 const html=lawyerSettingsBase();if(cloudUser?.role!=='admin')return html;
 const rid=residence().id,c=lawyerContact(rid);
 return '<section class="card card-padding"><h3>Abogado · Fichas contractuales</h3><p class="sm">Contacto de '+esc(residence().name)+'.</p><form id="lawyer-contact-form"><label>Nombre del abogado<input name="name" value="'+esc(c.name||'')+'"></label><label>WhatsApp del abogado<input name="phone" type="tel" value="'+esc(c.phone||'')+'" placeholder="+504 9999-9999" required></label><button class="btn btn-primary" type="submit">Guardar contacto</button></form></section>'+html;
};
document.addEventListener('submit',async e=>{
 if(e.target.id!=='lawyer-contact-form')return;e.preventDefault();e.stopImmediatePropagation();
 try{if(!contractIntakeAdmin())throw Error('Se requiere administrador sincronizado.');const d=new FormData(e.target),phone=lawyerPhone(d.get('phone'));if(!phone)throw Error('Número inválido.');
 const rid=residence().id,next={...db,company:{...db.company,lawyerContacts:{...db.company?.lawyerContacts,[rid]:{name:String(d.get('name')||'').trim().slice(0,120),phone:'+'+phone}}}};
 cloudWrite(JSON.stringify(next));db=next;await cloudFlush();render();toast(cloudBlocked||cloudOffline||cloudQueue?.latest!==cloudQueue?.confirmed?'Contacto pendiente de sincronización.':'Contacto del abogado guardado.');
 }catch(err){toast(err.message,'error');}
},true);
