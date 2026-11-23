// Libro de caja: importes exactos en centavos y movimientos recibidos/pagados.
export function financeJournal(movements,{from,until,residenceId='all'}){
 const cents=n=>Math.round(Number(n||0)*100);
 const active=movements.filter(e=>!e.voidedAt&&!['voided','cancelled'].includes(e.status)&&['income','expense'].includes(e.kind)&&/^\d{4}-\d{2}-\d{2}$/.test(e.date)&&Number.isFinite(Number(e.amount))&&Number(e.amount)>0&&(residenceId==='all'||e.residenceId===residenceId));
 const opening=active.filter(e=>e.date<from).reduce((n,e)=>n+(e.kind==='income'?1:-1)*cents(e.amount),0);
 let running=opening,income=0,expense=0;
 const rows=active.filter(e=>e.date>=from&&e.date<until).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id)).map(e=>{
  const value=cents(e.amount),entry=e.kind==='income'?value:0,exit=e.kind==='expense'?value:0;
  income+=entry;expense+=exit;running+=entry-exit;
  return {...e,income:entry/100,expense:exit/100,balance:running/100};
 });
 return {rows,opening:opening/100,income:income/100,expense:expense/100,closing:running/100};
}
export function financeJournalPdf(journal,{company='GRUPO H',period='',scope='Todas las residenciales'}={}){
 const pages=[];let commands=[],y;
 const clean=x=>String(x??'').replace(/[–—]/g,'-').replace(/[^\x20-\xFF]/g,' ');
 const escaped=x=>clean(x).replace(/[\\()]/g,'\\$&');
 const text=(x,y,value,size=9,bold=false)=>commands.push(`0.08 0.20 0.13 rg BT /${bold?'F2':'F1'} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${escaped(value)}) Tj ET`);
 const cash=n=>'L '+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 const wrap=(value,max=95)=>{const lines=[];let line='';for(const token of clean(value).split(/\s+/)){for(let i=0;i<token.length;i+=max){const word=token.slice(i,i+max);if((line+' '+word).length>max){lines.push(line);line='';}line+=(line?' ':'')+word;}}if(line)lines.push(line);return lines;};
 const start=()=>{commands=[];text(34,753,company,17,true);text(34,730,'LIBRO DIARIO MENSUAL',14,true);text(34,711,period+' | '+scope,9);text(34,689,'Saldo inicial: '+cash(journal.opening),10,true);y=666;};
 const end=()=>{text(34,25,'LOTIGEST PRO | Libro de caja - movimientos registrados',8);text(520,25,'Pag. '+(pages.length+1),8);pages.push(commands.join('\n'));};
 const space=h=>{if(y-h<48){end();start();}};
 start();
 for(const row of journal.rows){
  space(55);text(34,y,row.date+' | '+(row.kind==='income'?'INGRESO':'EGRESO')+' | '+cash(row.amount),10,true);y-=14;
  for(const line of wrap((row.description||row.category||'Movimiento')+(row.payee?' | '+row.payee:''))){space(14);text(34,y,line);y-=12;}
  for(const line of wrap('Referencia: '+(row.reference||row.id)+' | Saldo: '+cash(row.balance))){space(14);text(34,y,line,8);y-=12;}
  y-=9;
 }
 space(70);if(!journal.rows.length){text(34,y,'No hay movimientos registrados en este mes.');y-=20;}
 for(const line of ['Total ingresos: '+cash(journal.income),'Total egresos: '+cash(journal.expense),'Saldo final: '+cash(journal.closing)]){text(34,y,line,11,true);y-=17;}
 end();
 const objects=[null,'<< /Type /Catalog /Pages 2 0 R >>',null,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
 const kids=[];
 for(const stream of pages){const page=objects.length,content=page+1;kids.push(page+' 0 R');objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${content} 0 R >>`);objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);}
 objects[2]=`<< /Type /Pages /Count ${kids.length} /Kids [${kids.join(' ')}] >>`;
 // PDF usa bytes Latin-1 para conservar español y offsets exactos.
 let pdf='%PDF-1.4\n',offsets=[0];for(let i=1;i<objects.length;i++){offsets[i]=pdf.length;pdf+=`${i} 0 obj\n${objects[i]}\nendobj\n`;}
 const xref=pdf.length;pdf+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return new Blob([Uint8Array.from(pdf,c=>c.charCodeAt(0)&255)],{type:'application/pdf'});
}
