// Synthetic mixed-storage case: two active contracts and five owner receipts.
export function mixedOwnerFixture(rid='R'){
 const clientId='C-QA',lots=['L-QA-12','L-QA-13'];
 const state={version:3,company:{name:'PRUEBA'},currentResidence:rid,residences:[{id:rid,name:'PRUEBA'}],clients:[{id:clientId,name:'CLIENTE FICTICIO',identity:'0801199000021'}],payments:[],ownerPayments:[],historicalPayments:[],historicalContracts:[],reservations:[],cashEntries:[]};
 state.lots=lots.map((id,i)=>({id,residenceId:rid,stage:2,block:'N',sourceNumber:String(i+12),status:'sold',ownerClientId:clientId,price:528136.5}));
 state.sales=lots.map((lotId,i)=>({id:'V-QA-'+i,lotId,clientId,type:'credit',price:528136.5,downPayment:52613.68,months:84,date:'2025-11-06',firstDueDate:'2026-08-06',openingPaid:0,documentId:'CM-QA-'+i,source:'contract-intake'}));
 state.contractTexts=state.sales.map((s,i)=>({id:s.documentId,clientId,lotId:s.lotId,saleId:s.id,residenceId:rid,format:'manual',status:'active',number:'CM-000'+i,voidedAt:'2026-11-26T20:00:00Z',reactivationHistory:[{at:'2026-11-27T03:00:00Z'}],structured:{price:s.price,down:s.downPayment,months:s.months,date:s.date,firstDueDate:s.firstDueDate}}));
 const refs=state.lots.map(l=>({lotId:l.id,stage:l.stage,block:l.block,lot:l.sourceNumber,candidateLotIds:[l.id]}));
 state.ownershipStatements=[{id:'OS-QA',residenceId:rid,clientId,sourceName:'Registro manual de Contratos',references:refs,paymentIds:[],contractIds:[],manual:true,issues:[],documentedDownPaymentCents:null,documentedOpeningBalanceCents:null,documentedBalances:[]}];
 for(const [i,[date,amountCents,concept]] of [['2025-11-06',2000000,'Prima'],['2025-12-11',2000000,'Prima'],['2026-02-28',4000000,'Prima'],['2026-06-19',2522736,'Prima'],['2026-08-06',1166400,'ABONO A SOLARES · Mes 2026-08']].entries()){
  state.ownerPayments.push({id:'OP-00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),clientId,residenceId:rid,clientName:'CLIENTE FICTICIO',residenceName:'PRUEBA',date,amountCents,concept,method:'Efectivo',receiptReference:String(7151+i),receiptReferenceNormalized:String(7151+i),recordedAt:'2026-11-26T19:'+String(10+i).padStart(2,'0')+':00Z',allocations:[{statementId:'OS-QA',referenceIndex:null,amountCents,references:refs.map(r=>({lotId:r.lotId,stage:r.stage,block:r.block,solar:r.lot,mapAssignmentPending:false})),sourceName:'Registro manual de Contratos'}]});
 }
 return state;
}
