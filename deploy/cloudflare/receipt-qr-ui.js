// QR de recibos. La clave aleatoria se guarda junto al abono y se verifica contra D1.
// Nunca generes un QR que señale solamente a datos locales como si ya estuviera confirmado.
const RECEIPT_VERIFY_BASE='https://lotigest-demo.pages.dev/verificar-recibo.html?token=';
function receiptQrRecord(kind,id){
 const list=kind==='owner'?(db.ownerPayments||[]):db.payments;
 const first=list.find(p=>p.id===id);
 if(!first)throw Error('No existe el recibo de pago.');
 return kind==='owner'?[first]:first.groupId?list.filter(p=>p.groupId===first.groupId):[first];
}
function receiptQrUrl(kind,id){
 const rows=receiptQrRecord(kind,id);
 const tokens=[...new Set(rows.map(p=>p.verifyToken).filter(Boolean))];
 if(tokens.length>1||tokens.some(t=>!/^[a-f0-9]{32}$/.test(t)))throw Error('El código del recibo necesita revisión. No se imprimió un QR incorrecto.');
 let token=tokens[0];
 if(!token){
  if(!cloudReady||cloudBlocked||cloudUser?.role==='sales')throw Error('No puedes emitir un QR sin una sesión de administración disponible. Conserva tu copia pendiente.');
  const bytes=crypto.getRandomValues(new Uint8Array(16));
  token=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 }
 if(rows.some(p=>p.verifyToken!==token)){
  const next=JSON.parse(JSON.stringify(db));
  const list=kind==='owner'?(next.ownerPayments||[]):next.payments;
  const ids=new Set(rows.map(p=>p.id));
  for(const p of list)if(ids.has(p.id))p.verifyToken=token;
  cloudWrite(JSON.stringify(next));
  db=next;
 }
 return RECEIPT_VERIFY_BASE+token;
}
function receiptQrModel(url){
 if(typeof qrcode!=='function')throw Error('No se pudo cargar el generador QR local.');
 const qr=qrcode(0,'M');qr.addData(url);qr.make();return qr;
}
function receiptQrSvg(url){
 const qr=receiptQrModel(url),modules=qr.getModuleCount(),margin=4,size=modules+2*margin;
 let rects='';
 for(let y=0;y<modules;y++)for(let x=0;x<modules;x++)if(qr.isDark(y,x))
  rects+='<rect x="'+(x+margin)+'" y="'+(y+margin)+'" width="1" height="1"/>';
 return '<svg viewBox="0 0 '+size+' '+size+'" width="142" height="142" role="img" aria-label="Código QR para verificar recibo" style="background:white;border:1px solid #d0dfd1;max-width:100%"><g fill="#111">'+rects+'</g></svg>';
}
function receiptQrVector(url){
 const qr=receiptQrModel(url),modules=qr.getModuleCount(),margin=4,total=modules+2*margin;
 const size=91,unit=size/total,x0=467,y0=139;
 const commands=['q','1 1 1 rg',x0+' '+y0+' '+size+' '+size+' re f','0 0 0 rg'];
 // PDF tiene su origen abajo a la izquierda, el módulo superior se dibuja arriba.
 for(let y=0;y<modules;y++){
  for(let x=0;x<modules;x++)if(qr.isDark(y,x)){
   commands.push((x0+(x+margin)*unit).toFixed(3)+' '+(y0+(modules-y-1+margin)*unit).toFixed(3)+' '+(unit+.03).toFixed(3)+' '+(unit+.03).toFixed(3)+' re f');
  }
 }
 commands.push('Q');return commands.join('\n');
}
function receiptQrShowPreview(url){
 const box=document.querySelector('#modal-root .modal-content');
 if(!box)return;
 const section=document.createElement('section');
 section.className='receipt-qr-verify';
 section.style.cssText='border-top:1px solid #b7d6bf;margin-top:16px;padding:14px 0;text-align:center;color:inherit';
 section.innerHTML='<strong>Verificación de pago con QR</strong><div style="margin:10px auto;display:flex;justify-content:center">'+receiptQrSvg(url)+'</div><p style="font-size:12px">Escanea para comprobar folio, fecha e importe en D1. Se requiere internet.</p>';
 const a=document.createElement('a');a.textContent='Abrir verificación';a.href=url;a.target='_blank';a.rel='noopener noreferrer';section.append(a);
 box.append(section);
}
const receiptQrOriginalPreview=paymentReceiptPreview;
paymentReceiptPreview=function(id){
 if((db.ownerPayments||[]).some(p=>p.id===id))return receiptQrOriginalPreview(id);
 try{const url=receiptQrUrl('payment',id);receiptQrOriginalPreview(id);receiptQrShowPreview(url);}
 catch(e){toast(e.message||'No se pudo generar el QR del recibo.','error');}
};
const receiptQrOriginalOwnerPreview=ownerPaymentPreview;
ownerPaymentPreview=function(id){
 try{const url=receiptQrUrl('owner',id);receiptQrOriginalOwnerPreview(id);receiptQrShowPreview(url);}
 catch(e){toast(e.message||'No se pudo generar el QR del recibo.','error');}
};
