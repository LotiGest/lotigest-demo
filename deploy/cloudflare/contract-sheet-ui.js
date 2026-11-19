function contractSheetModel(clientId,{documentId='',lotId=''}={}){
 const client=getClient(clientId);if(!client)throw Error('No se encontró el cliente.');
 const document=(db.contractTexts||[]).find(d=>d.id===documentId&&d.clientId===clientId);
 const ids=document?(document.contractLotIds||[document.lotId]):lotId?[lotId]:db.lots.filter(l=>l.residenceId===residence().id&&(l.ownerClientId===clientId||db.sales.some(s=>s.lotId===l.id&&s.clientId===clientId)||(db.contractTexts||[]).some(d=>d.lotId===l.id&&d.clientId===clientId&&d.status!=='voided'))).map(l=>l.id);
 const documents=(db.contractTexts||[]).filter(d=>d.clientId===clientId&&d.status!=='voided');
 const p=document?.structured||documents.find(d=>ids.includes(d.lotId))?.structured||{};
 const showMoney=v=>v==null||v===''||!Number.isFinite(Number(v))?'No registrado':money(Number(v));
 const sections=[{title:'GENERALES DE CLIENTE',rows:[['NOMBRE DE CLIENTE',client.name||p.name],['DNI',client.identity||p.identity],['RTN',client.rtn||p.rtn],['ESTADO CIVIL',client.maritalStatus||p.maritalStatus],['PROFESIÓN U OFICIO',client.occupation||p.occupation],['DIRECCIÓN',client.address||p.address]]}];
 for(const id of [...new Set(ids)]){
  const lot=getLot(id);if(!lot)continue;
  const doc=documents.find(d=>d.lotId===id),fields=doc?.structured||{},sale=db.sales.find(s=>s.lotId===id&&s.clientId===clientId),terms=monthlyLotTerms(db,id);
  const price=sale?.price??fields.price,down=sale?.downPayment??fields.down,months=sale?.months??fields.months;
  sections.push({title:'SOBRE LOTE'+(ids.length>1?' - SOLAR '+(lot.sourceNumber||lot.number||lot.id):''),rows:[['ETAPA / BLOQUE / SOLAR','Etapa '+(lot.stage||'Por confirmar')+' / '+lot.block+' / '+(lot.sourceNumber||lot.number||lot.id)],['ÁREA (VARAS²)',fields.areaVaras??lot.areaVaras2],['METROS CUADRADOS',fields.areaM2??lot.area]]},
   {title:'COLINDANCIAS',rows:['north','south','east','west'].map((key,i)=>[['NORTE','SUR','ESTE','OESTE'][i],fields[key]||lot[key]||lot.dimensions?.[key]])},
   {title:'DATOS DE VENTA',rows:[['PRECIO DEL LOTE',showMoney(price)],['PRIMA PACTADA',showMoney(down)],['SALDO A FINANCIAR',price!=null&&down!=null?showMoney(Number(price)-Number(down)):'No registrado'],['CUOTA MENSUAL',terms?showMoney(terms.monthlyCents/100)+' MENSUAL':'Pendiente de completar contrato'],['TIEMPO DE CONTRATO',months?months+' cuotas / '+(Number(months)/12).toLocaleString('es-HN',{maximumFractionDigits:2})+' años':'No registrado']]});
  const observations=[fields.pricePerVara!=null?'Precio por vara²: '+showMoney(fields.pricePerVara):'',fields.observations||'',fields.documentAreaM2!=null?'Área conjunta de la ficha: '+fields.documentAreaM2+' m² (no representa la medida individual de este solar).':'',fields.documentAreaVaras!=null?'Varas² conjuntas: '+fields.documentAreaVaras:''].filter(Boolean).join(' ');
  if(observations)sections.push({title:'OBSERVACIONES',rows:[['OBSERVACIONES',observations]]});
 }
 if(!ids.length)sections.push({title:'SOBRE LOTE / DATOS DE VENTA',rows:[['ESTADO','No hay solares vinculados en esta residencial. Completa el contrato para mostrar la cuota mensual.']]});
 return {company:db.company?.name||'GRUPO H',residence:residenceName(getLot(ids[0])?.residenceId||residence().id),sections};
}
function downloadContractSheet(clientId,options={}){
 if(cloudUser?.role!=='admin')throw Error('Necesitas acceso de administrador para descargar la ficha privada.');
 const model=contractSheetModel(clientId,options),name='Ficha-'+String(getClient(clientId)?.name||clientId).replace(/[^a-zA-Z0-9ÁÉÍÓÚÑáéíóúñ -]/g,'').replace(/\s+/g,'-').slice(0,100)+'.pdf';
 download(name,contractSheetPdf(model),'application/pdf');
}
const sheetBaseDescription=contractIntakeDescription;
contractIntakeDescription=function(doc){return sheetBaseDescription(doc)+'<button type="button" class="btn btn-primary" data-contract-sheet="'+esc(doc.id)+'">Descargar ficha PDF</button>';};
const sheetBaseClient=viewClient;
viewClient=function(id){const result=sheetBaseClient(id);if(cloudUser?.role==='admin')document.querySelector('#modal-root .modal-footer')?.insertAdjacentHTML('afterbegin','<button type="button" class="btn btn-outline" data-client-sheet="'+esc(id)+'">Descargar ficha PDF</button>');return result;};
const sheetBaseSale=viewSale;
viewSale=function(id){const result=sheetBaseSale(id),sale=getSale(id);if(sale&&cloudUser?.role==='admin')document.querySelector('#modal-root .modal-footer')?.insertAdjacentHTML('afterbegin','<button type="button" class="btn btn-outline" data-client-sheet="'+esc(sale.clientId)+'" data-sheet-lot="'+esc(sale.lotId)+'">Descargar ficha PDF</button>');return result;};
document.addEventListener('click',event=>{
 const button=event.target.closest?.('[data-contract-sheet],[data-client-sheet]');if(!button)return;
 event.preventDefault();event.stopImmediatePropagation();
 try{const doc=(db.contractTexts||[]).find(d=>d.id===button.dataset.contractSheet);downloadContractSheet(doc?.clientId||button.dataset.clientSheet,{documentId:doc?.id||'',lotId:button.dataset.sheetLot||''});}catch(error){toast(error.message,'error');}
},true);
