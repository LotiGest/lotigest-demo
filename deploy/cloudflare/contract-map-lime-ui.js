// Mapa administrativo LOTIGEST: contrato registrado = verde limón, prima COBRADA = verde corazón.
// Los colores se derivan del historial; NO se guardan como pagos ni modifican saldos.
// Se usa el vínculo documental real; nunca se cambia el estado de cuotas o el inventario.
const contractMapUnregistered='#171717';
const contractMapLime='#A3E635';
const contractMapPrimaGreen='#16A34A'; // 💚 distintivo, no es el verde limón de contrato.
function contractMapDocument(lotId){
 return (db.contractTexts||[]).find(d=>d?.lotId===lotId&&['photo+ocr','manual'].includes(d.format)&&['pending-sale','active'].includes(d.status))||null;
}

function contractMapHasRecordedPrima(lot){
 if(!lot?.id)return false;
 const sales=(db.sales||[]).filter(s=>s.lotId===lot.id&&s.type==='credit'&&Number(s.downPayment)>0);
 // Al activar contrato se guarda openingPaid:0. El valor pactado no equivale a dinero recibido.
 for(const s of sales){
  const paid=Math.max(0,Number(s.openingPaid)||0)+
   (db.payments||[]).filter(p=>p.saleId===s.id&&!p.voidedAt&&!p.deletedAt)
    .reduce((a,p)=>a+Math.max(0,Number(p.amount)||0),0);
  // En el crédito LOTIGEST, el primer dinero acreditado se aplica a la prima.
  if(paid>=.01)return true;
 }
 const document=contractMapDocument(lot.id);
 const expectedClient=lot.ownerClientId||document?.clientId||sales[0]?.clientId||null;
 // Un abono conjunto sin desglose individual NO prueba que se pagó la prima de cada solar.
 if((db.ownerPayments||[]).some(p=>
  p.residenceId===lot.residenceId&&!p.voidedAt&&!p.deletedAt&&
  (!expectedClient||p.clientId===expectedClient)&&
  /^prima(?:\b|\s|[·:–-])/i.test(String(p.concept||''))&&
  Number(p.amountCents)>0&&
  (p.allocations||[]).some(a=>Number(a.amountCents)>0&&
   a.references?.length===1&&a.references[0].lotId===lot.id&&!a.references[0].mapAssignmentPending)
 ))return true;
 // El historial Excel se conserva como referencia; no equivale a una prima confirmada.
 // Solo abonos guardados en registros de cobro reales cambian el color.
 return false;
}
function contractMapDisplayState(lot,baseStatus){
 if(baseStatus==='private'||lot?.type==='private'||lot?.status==='private')return 'private';
 const doc=lot&&contractMapDocument(lot.id);
 if(!doc){
  // Color de seguimiento, no bloqueo de ventas. Conserva la marca negra
  // incluso tras desvincular una asignación importada sin contabilizar.
  const legacy=lot&&(lot.ownerClientId||lot.clientId||lot.purchaseFromPlan||lot.historyRequiresReview||
   lot.mapDebtFlag||lot.pendingContractId||lot.ownerUnlinkHistory?.at(-1)?.legacyImportArchived||
   ['reserved','sold','debt'].includes(lot.status));
  return legacy||['reserved','sold','debt'].includes(baseStatus)?'unregistered':baseStatus;
 }
 if(baseStatus==='debt')return 'debt';
 // Mantener las señales de contrato y prima que ya utiliza LOTIGEST.
 return contractMapHasRecordedPrima(lot)?'prima-paid':'contracted';
}

function contractMapLinkedLot(feature,record){
 if(record?.lot)return record.lot;
 // No anular una vinculación de plano explícita existente con otro terreno.
 if(record?.data?.lotId)return null;
 const normalize=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'').replace(/^0+(?=\d)/,'');
 const stage=Number(feature.stage||0);
 if(![1,2].includes(stage))return null;
 const block=normalize(record?.data?.block||feature.block),number=normalize(feature.number);
 if(!block||!number)return null;
 const matches=(db.lots||[]).filter(l=>l.residenceId===residence().id&&Number(l.stage)===stage&&normalize(l.block)===block&&normalize(l.sourceNumber||l.number)===number);
 return matches.length===1?matches[0]:null;
}
const contractMapBaseRecord=arrayanRecord;
arrayanRecord=function(feature){
 // El puente se instala antes de inicializar las constantes del mapa.
 // Registrar el color al consultar el mapa, cuando la paleta ya existe.
 arrayanColors.unregistered=contractMapUnregistered;
 arrayanColors.contracted=contractMapLime;
 arrayanColors['prima-paid']=contractMapPrimaGreen;
 const record=contractMapBaseRecord(feature);
 const lot=contractMapLinkedLot(feature,record);
 const derived=contractMapDisplayState(lot,record.status);
 return derived===record.status?record:{...record,lot,status:derived};
};
const contractMapBasePage=arrayanPage;
arrayanPage=function(){
 let html=contractMapBasePage();
 const states=residenceFeatures().map(f=>arrayanRecord(f).status);
 const unregistered=states.filter(s=>s==='unregistered').length;
 const count=states.filter(s=>s==='contracted').length;
 const primas=states.filter(s=>s==='prima-paid').length;
 const chip='<span style="display:flex;gap:6px;align-items:center;font-size:12px"><i style="width:13px;height:13px;border-radius:3px;background:'+contractMapUnregistered+';border:1px solid #888"></i>Pendiente de contrato: '+unregistered+'</span>'+
 '<span style="display:flex;gap:6px;align-items:center;font-size:12px"><i style="width:13px;height:13px;border-radius:3px;background:'+contractMapLime+'"></i>Contrato registrado (sin prima): '+count+'</span>'+
 '<span style="display:flex;gap:6px;align-items:center;font-size:12px"><i style="width:13px;height:13px;border-radius:3px;background:'+contractMapPrimaGreen+'"></i>💚 Prima registrada: '+primas+'</span>';
 html=html.replace('</div><div class="page-cols">',chip+'</div><div class="page-cols">');
 html=html.replace(/(<select id="ar-filter"[^>]*>)([\s\S]*?)(<\/select>)/,(_all,a,b,c)=>a+b+
  '<option value="unregistered" '+(arrayanFilter==='unregistered'?'selected':'')+'>Negro · Pendiente de contrato</option>'+
  '<option value="contracted" '+(arrayanFilter==='contracted'?'selected':'')+'>Contratos sin prima</option>'+
  '<option value="prima-paid" '+(arrayanFilter==='prima-paid'?'selected':'')+'>💚 Prima registrada</option>'+c);
 return html;
};
const contractMapBaseDetails=arrayanDetails;
arrayanDetails=function(){
 const result=contractMapBaseDetails();
 const feature=residenceFeatures().find(f=>f.key===arrayanSelected);
 if(!feature)return result;
 const record=arrayanRecord(feature);
 if(record.status==='unregistered')return result+
  '<div class="notice-card" style="margin-top:12px"><strong>Pendiente de contrato · Negro</strong><p class="sm">Solar con apartado o asignación anterior sin ficha contractual vigente. El color es solo un indicador; verifica disponibilidad real antes de asignarlo desde Contratos.</p></div>';
 if(!['contracted','prima-paid'].includes(record.status)||!record.lot)return result;
 const doc=contractMapDocument(record.lot.id);
 const client=getClient(doc?.clientId);
 const hasPrima=record.status==='prima-paid';
 const stateLabel='<strong style="color:'+(hasPrima?contractMapPrimaGreen:contractMapLime)+'">'+(hasPrima?'💚 Prima registrada':'Contrato registrado')+'</strong>';
 let html=result.replace(/<strong style="color:[^"]+">(?:Disponible|Comprado|Cuota pendiente)<\/strong>/,stateLabel);
 html=html.replace(/<select id="ar-status"([^>]*)>/,'<select id="ar-status" disabled>');
 html=html.replace(/<option value="available"[^>]*>Amarillo · Disponible<\/option>/,
  '<option selected value="'+(hasPrima?'prima-paid':'contracted')+'">'+(hasPrima?'💚 Verde · Prima registrada':'Verde limón · Contrato registrado')+'</option>');
 html=html.replace(/<button class="btn btn-primary" data-action="arrayan-save">Guardar solar<\/button>/,'<button class="btn btn-outline" type="button" disabled>Gestionar contrato desde Contratos</button>');
 html+='<div class="notice-card" style="margin-top:12px"><strong>Cliente: '+esc(client?.name||doc?.structured?.name||'Por completar')+'</strong>'+
  '<p class="sm">'+(hasPrima?'Existe al menos un pago de prima vinculado a este solar. Puede estar incompleta; revisa su historial antes de cobrar la siguiente cuota.':'Ficha registrada y vinculada al solar. La prima pactada no se marca como pagada.')+'</p>'+
  '<button type="button" class="btn btn-outline" data-contract-ficha-view="'+esc(doc.id)+'">Ver ficha contractual</button></div>';
 return html;
};

// GPS de solares con perímetro propio: usar los mismos colores que el croquis.
// La mora mantiene prioridad visual (rojo), para no ocultar cuotas vencidas.
const contractMapBaseGeoColor=geoStatusColor;
geoStatusColor=function(lot){
 const base=contractMapBaseGeoColor(lot);
 if(!lot)return base;
 const status=contractMapDisplayState(lot,mapVisualStatus(lot));
 if(status==='unregistered')return contractMapUnregistered;
 if(status==='contracted')return contractMapLime;
 if(status==='prima-paid')return contractMapPrimaGreen;
 return base;
};
