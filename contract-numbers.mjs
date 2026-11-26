// Número público independiente del UUID usado por solares, ventas y pagos.
export function ensureContractNumbers(state,previous=null){
 if(!state||!Array.isArray(state.contractTexts))return state;
 if(previous)ensureContractNumbers(previous);
 const prior=new Map((previous?.contractTexts||[]).map(d=>[d.id,d.number]));
 const parse=value=>{const m=/^CM-(\d{4,})$/.exec(String(value||''));const n=m?Number(m[1]):0;return Number.isSafeInteger(n)&&n>0?n:0;};
 let highest=previous?Math.max(previous.contractSequence||0,0):Math.max(Number.isSafeInteger(state.contractSequence)?state.contractSequence:0,0);
 const rows=state.contractTexts.map((doc,index)=>({doc,index})).sort((a,b)=>{
  const x=Date.parse(a.doc.createdAt||''),y=Date.parse(b.doc.createdAt||'');
  return Number.isFinite(x)&&Number.isFinite(y)&&x!==y?x-y:b.index-a.index;
 });
 const used=new Set(),pending=[];
 for(const {doc} of rows){
  // Los números ya confirmados por el servidor no se cambian al editar.
  const value=previous?prior.get(doc.id):doc.number,n=parse(value);
  if(n&&!used.has(n)){doc.number='CM-'+String(n).padStart(4,'0');used.add(n);highest=Math.max(highest,n);}
  else pending.push(doc);
 }
 for(const doc of pending){
  if(highest>=Number.MAX_SAFE_INTEGER)throw Error('Se agotó el correlativo de contratos.');
  doc.number='CM-'+String(++highest).padStart(4,'0');
 }
 state.contractSequence=highest;
 return state;
}
export function contractDisplayNumber(doc){return doc?.number||doc?.id||'—';}
