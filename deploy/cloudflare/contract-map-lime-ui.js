// Mapa administrativo LOTIGEST: contrato registrado = verde limón.
// Se usa el vínculo documental real; nunca se cambia el estado de cuotas o el inventario.
const contractMapLime='#A3E635';
arrayanColors.contracted=contractMapLime;
function contractMapDocument(lotId){
 return (db.contractTexts||[]).find(d=>d?.lotId===lotId&&d.format==='photo+ocr'&&['pending-sale','active'].includes(d.status))||null;
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
 const record=contractMapBaseRecord(feature);
 if(record.status==='debt'||record.status==='private'||record.status==='reserved')return record;
 const lot=contractMapLinkedLot(feature,record);
 if(!lot||!contractMapDocument(lot.id))return record;
 return {...record,lot,status:'contracted'};
};
const contractMapBasePage=arrayanPage;
arrayanPage=function(){
 let html=contractMapBasePage();
 const count=residenceFeatures().filter(f=>arrayanRecord(f).status==='contracted').length;
 const chip='<span style="display:flex;gap:6px;align-items:center;font-size:12px"><i style="width:13px;height:13px;border-radius:3px;background:'+contractMapLime+'"></i>Contrato registrado: '+count+'</span>';
 html=html.replace('</div><div class="page-cols">',chip+'</div><div class="page-cols">');
 html=html.replace(/(<select id="ar-filter"[^>]*>)([\s\S]*?)(<\/select>)/,(_all,a,b,c)=>a+b+'<option value="contracted" '+(arrayanFilter==='contracted'?'selected':'')+'>Contratos registrados</option>'+c);
 return html;
};
const contractMapBaseDetails=arrayanDetails;
arrayanDetails=function(){
 const result=contractMapBaseDetails();
 const feature=residenceFeatures().find(f=>f.key===arrayanSelected);
 if(!feature)return result;
 const record=arrayanRecord(feature);
 if(record.status!=='contracted'||!record.lot)return result;
 const doc=contractMapDocument(record.lot.id);
 const client=getClient(doc?.clientId);
 const stateLabel='<strong style="color:'+contractMapLime+'">Contrato registrado</strong>';
 let html=result.replace(/<strong style="color:[^"]+">Disponible<\/strong>/,stateLabel);
 html=html.replace(/<select id="ar-status"([^>]*)>/,'<select id="ar-status" disabled>');
 html=html.replace(/<option value="available"[^>]*>Amarillo · Disponible<\/option>/,'<option selected value="contracted">Verde limón · Contrato registrado</option>');
 html=html.replace(/<button class="btn btn-primary" data-action="arrayan-save">Guardar solar<\/button>/,'<button class="btn btn-outline" type="button" disabled>Gestionar contrato desde Contratos</button>');
 html+='<div class="notice-card" style="margin-top:12px"><strong>Cliente: '+esc(client?.name||doc?.structured?.name||'Por completar')+'</strong>'+
  '<p class="sm">Ficha registrada y vinculada al solar. La prima pactada no se marca como pagada.</p>'+
  '<button type="button" class="btn btn-outline" data-contract-ficha-view="'+esc(doc.id)+'">Ver ficha contractual</button></div>';
 return html;
};
