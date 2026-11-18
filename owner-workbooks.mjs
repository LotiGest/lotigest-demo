import {canonicalBlock} from './functions/api/app/block-corrections.js';
import {createHash} from 'node:crypto';
import {historyCents,parseHistoryDate,prepareLedgerImport,applyLedgerImport} from './ledger-import.mjs';
const norm=v=>String(v??'').normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const numbers=v=>/^\d+(?:\s*(?:,|Y|\/|&)\s*\d+)*$/.test(norm(v))?norm(v).split(/\s*(?:,|Y|\/|&)\s*/).map(Number):null;
export function documentReferences(book){
 const c=Object.fromEntries(book.sheets[0].cells.map(x=>[x.cell,x.value])),block=norm(c.D4),ns=numbers(c.E4),issues=[];let refs=[];
 const filename=norm(book.file.replace(/\.xlsx$/i,''));const suffix=/(?:BLOQUE|LOTE)\s+([A-ZÑ])\s*#?\s*(\d+(?:\s*(?:,|Y|\/|&)\s*\d+)*)$/.exec(filename)||/\b([A-ZÑ])\s*(\d+(?:\s*(?:,|Y|\/|&)\s*\d+)*)$/.exec(filename);const fileRefs=suffix?numbers(suffix[2])?.map(lot=>({block:suffix[1],lot})):null;
 if(/^[A-ZÑ]$/.test(block)&&ns)refs=ns.map(lot=>({block,lot}));
 else if(block==='BLOQUE'&&ns&&fileRefs&&ns.slice().sort((a,b)=>a-b).join()===fileRefs.map(r=>r.lot).sort((a,b)=>a-b).join())refs=fileRefs;
 else if(block.includes(',')&&ns){for(const cell of book.sheets[0].cells){if(!/^B\d+$/.test(cell.cell)||!/^BLOQUE\s/i.test(String(cell.value)))continue;const text=norm(cell.value).replace(/^BLOQUE\s+/,'');let lastBlock;const found=[];for(const part of text.split(',')){const m=/^([A-ZÑ])?\s*(\d+)$/.exec(part.trim());if(!m){found.length=0;break;}lastBlock=m[1]||lastBlock;if(!lastBlock){found.length=0;break;}found.push({block:lastBlock,lot:Number(m[2])});}if(found.length===ns.length&&found.map(r=>r.lot).sort((a,b)=>a-b).join()===ns.slice().sort((a,b)=>a-b).join()){refs=found;break;}}
  if(!refs.length&&block.split(',').length===ns.length&&block.split(',').every(b=>/^[A-ZÑ]$/.test(b.trim())))refs=block.split(',').map((b,i)=>({block:b.trim(),lot:ns[i]}));
 }
 if(fileRefs&&refs.length&&JSON.stringify(fileRefs.slice().sort((a,b)=>(a.block+a.lot).localeCompare(b.block+b.lot)))!==JSON.stringify(refs.slice().sort((a,b)=>(a.block+a.lot).localeCompare(b.block+b.lot))))issues.push('La referencia del nombre del archivo difiere de las celdas.');
 if(!refs.length)issues.push('Bloque o solar sin referencia inequívoca.');if(new Set(refs.map(r=>r.block+':'+r.lot)).size!==refs.length)issues.push('Referencia repetida en el documento.');
 return {c,refs,issues};
}
export async function prepareOwnerWorkbooks(input,books,residenceId='arrayan'){
 let state=structuredClone(input);state.ownershipStatements??=[];state.historicalPayments??=[];state.historicalContracts??=[];state.ledgerImportBatches??=[];
 for(const l of state.lots)if(l.residenceId===residenceId){const b=canonicalBlock(l.sourceFeatureKey);if(b)l.block=b;}
 const summary={files:books.length,newStatements:0,newClients:0,assignedLots:0,reviewStatements:0,newMovements:0,skippedStatements:0};const sourceClaims=new Map();
 const parsed=books.map(book=>({book,...documentReferences(book)}));for(const p of parsed)if(!p.issues.length)for(const r of p.refs){const key=r.block+':'+r.lot;if(!sourceClaims.has(key))sourceClaims.set(key,new Set());sourceClaims.get(key).add(norm(p.c.B4));}
 for(const p of parsed){const {book,c,refs}=p,issues=[...p.issues],name=norm(c.B4),sourceDigest=hash(book),id='OS-'+sourceDigest.slice(0,28);if(state.ownershipStatements.some(s=>s.id===id)){summary.skippedStatements++;continue;}
  if(!name||name.length>200)throw Error('Documento sin nombre válido.');let matches=state.clients.filter(x=>norm(x.name)===name),clientId;if(matches.length>1)issues.push('Varios clientes existentes comparten el nombre.');else if(matches.length===1)clientId=matches[0].id;else{clientId='CH-'+hash('client:'+name).slice(0,22);state.clients.push({id:clientId,name,identity:'',phone:norm(c.C4),email:'',address:'',importIdentityStatus:'name-only'});summary.newClients++;}
  const links=refs.map(ref=>{const candidates=state.lots.filter(l=>l.residenceId===residenceId&&norm(l.block)===ref.block&&Number(l.sourceNumber)===ref.lot&&l.type!=='private'&&l.status!=='private');let issue;if(sourceClaims.get(ref.block+':'+ref.lot)?.size>1)issue='Más de un propietario en los archivos reclama este solar.';else if(candidates.length!==1)issue=candidates.length?'Numeración repetida en el mapa: selecciona el código exacto.':'El solar no se encontró en el inventario.';const l=candidates[0],sale=l&&state.sales.find(s=>s.lotId===l.id);if(candidates.length===1&&(sale&&sale.clientId!==clientId||l.ownerClientId&&l.ownerClientId!==clientId))issue='Ya existe otro propietario o una venta en el solar.';return {...ref,candidateLotIds:candidates.map(l=>l.id),lotId:!issue&&!issues.length&&clientId?l.id:null,issue:issue||null};});
  const sheet=book.sheets[0],cells=Object.fromEntries(sheet.cells.map(x=>[x.cell,x.value])),rowNumbers=[...new Set(sheet.cells.map(x=>Number(x.cell.replace(/^[A-Z]+/,''))))].filter(n=>n>=4).sort((a,b)=>a-b),origins=[],rows=[['CLIENTE','BLOQUE','SOLAR','FECHA DE PAGO','MONTO (L)','TIPO DE PAGO','ESTADO','ID CONTRATO']];
  for(const n of rowNumbers){for(const [col,type] of [['F','PRIMA'],['H','ABONO']]){const value=cells[col+n];if(value==null||String(value).trim()==='')continue;const rawDate=cells['G'+n],date=parseHistoryDate(String(rawDate??'').replace(/\\/g,'/'));origins.push(n);rows.push([name,norm(c.D4),norm(c.E4),date||rawDate||null,value,type,'REVISAR ASIGNACIÓN',id]);}}
  // Keep contractual figures as documentary values. Do not infer a loan schedule or redistribute a combined payment.
  const plan=rows.length>1?await prepareLedgerImport([{sheet:sheet.sheet,rows}],state,residenceId,book.file):null;
  if(plan){state=applyLedgerImport(state,plan);summary.newMovements+=plan.rows.length;for(const row of plan.rows){const stored=state.historicalPayments.find(x=>x.id===row.id);stored.ownerStatementId=id;stored.sourceWorkbookRow=origins[row.sourceRow-2]||null;stored.sourceRow=stored.sourceWorkbookRow||row.sourceRow;}}
  const statement={id,residenceId,clientId:clientId||null,clientName:name,sourceName:book.file,sourceDigest,rawReference:{block:c.D4??null,lot:c.E4??null},references:links,issues,documentedDownPaymentCents:historyCents(c.F4),documentedOpeningBalanceCents:historyCents(c.K4),documentedDate:parseHistoryDate(String(c.G4??'').replace(/\\/g,'/')),paymentIds:plan?.rows.map(r=>r.id)||[],contractIds:plan?.contracts.map(r=>r.id)||[],documentedBalances:rowNumbers.filter(n=>cells['K'+n]!=null).map(n=>({row:n,value:cells['K'+n],amountCents:historyCents(cells['K'+n])})),importedAt:new Date().toISOString()};
  state.ownershipStatements.push(statement);summary.newStatements++;
  for(const ref of links)if(ref.lotId){const lot=state.lots.find(l=>l.id===ref.lotId);lot.ownerClientId=clientId;lot.ownershipStatementIds=[...new Set([...(lot.ownershipStatementIds||[]),id])];lot.status='sold';lot.historyRequiresReview=true;summary.assignedLots++;}
  if(issues.length||links.some(r=>r.issue)||!links.length)summary.reviewStatements++;
 }
 return {state,summary};
}
