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
export function financeJournalPdf(journal,{company='GRUPO H',period='',scope='Todas las residenciales',from='',to=''}={}){
 const pages=[];let commands=[],y;
 const green='0.06 0.25 0.11',orange='0.68 0.30 0.06',light='0.94 0.97 0.91',line='0.79 0.86 0.77';
 const clean=x=>String(x??'').replace(/[–—]/g,'-').replace(/[^\x20-\xFF]/g,' ');
 const escaped=x=>clean(x).replace(/[\\()]/g,'\\$&');
 const text=(x,y,value,size=9,bold=false,color=green)=>commands.push(`${color} rg BT /${bold?'F2':'F1'} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${escaped(value)}) Tj ET`);
 const fontWidths={"normal":[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500],"bold":[278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556]};
 const width=(value,size=9,bold=false)=>[...clean(value)].reduce((n,c)=>n+(fontWidths[bold?'bold':'normal'][c.charCodeAt(0)-32]||0),0)*size/1000;
 const right=(x,y,value,size=9,bold=false,color=green)=>text(x-width(value,size,bold),y,value,size,bold,color);
 const center=(x,y,value,size=9,bold=false)=>text(x-width(value,size,bold)/2,y,value,size,bold);
 const rect=(x,y,w,h,color)=>commands.push(`${color} rg ${x} ${y} ${w} ${h} re f`);
 const rule=(x1,y1,x2,y2,color=line)=>commands.push(`${color} RG 0.5 w ${x1} ${y1} m ${x2} ${y2} l S`);
 const amount=n=>Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}),cash=n=>'L '+amount(n);
 const date=iso=>/^\d{4}-\d{2}-\d{2}$/.test(iso)?iso.slice(8,10)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4):iso;
 const wrap=(value,max,size=8.5,bold=false)=>{
  const lines=[],limit=max*size*.53;let current='';
  for(const token of clean(value).split(/\s+/)){
   if(current&&width(current+' '+token,size,bold)>limit){lines.push(current);current='';}
   let part='';for(const char of token){if(part&&width(part+char,size,bold)>limit){lines.push(part);part='';}part+=char;}
   current+=(current?' ':'')+part;
  }
  if(current)lines.push(current);return lines.length?lines:[''];
 };
 const columns=[24,88,160,328,412,496,588];
 function tableHeader(){rect(24,y-25,564,25,green);['Fecha','Correlativo','Concepto','Ingreso (L)','Egreso (L)','Saldo (L)'].forEach((label,i)=>text(columns[i]+6,y-16,label,8,true,'1 1 1'));y-=25;}
 function start(first=false,table=true){
  commands=[];text(24,751,clean(company).slice(0,28),22,true);right(588,752,'LOTIGEST PRO',18,true);right(588,735,'Sistema de Gestión de Lotificaciones',8);rule(24,718,588,718,green);
  center(306,684,'LIBRO DIARIO DIGITAL',25,true);center(306,663,'Ingresos y egresos · '+period,12);
  const scopeLines=wrap('Residencial: '+scope,112);let metaY=632;
  rect(24,metaY-15-scopeLines.length*11,564,27+scopeLines.length*11,light);
  for(const label of scopeLines){text(34,metaY,label,8.5,true);metaY-=11;}
  text(34,metaY-3,'Período: '+(from&&to?date(from)+' al '+date(to):period),8.5);right(578,metaY-3,'Moneda: Lempiras (HNL)',8.5);
  y=metaY-32;
  if(first){rect(24,y-31,564,31,light);text(34,y-20,'SALDO INICIAL DEL MES',12,true);right(578,y-20,cash(journal.opening),14,true);y-=48;}
  else y-=8;
  if(table)tableHeader();
 }
 function end(){rule(24,43,588,43,green);text(24,29,'LOTIGEST PRO · Libro de caja',8,true);right(588,29,'Página '+(pages.length+1)+' de __PAGES__',8);pages.push(commands.join('\n'));}
 start(true);
 for(const [index,row] of journal.rows.entries()){
  const reference=String(row.correlative??row.reference??'').trim()||'Sin correlativo';
  const description=(row.description||row.category||'Movimiento')+(row.payee?' · '+row.payee:'');
  const cells=[wrap(date(row.date),12),wrap(reference,13,8.5,true),wrap(description,34)];
  const lines=Math.max(...cells.map(c=>c.length));let offset=0;
  while(offset<lines){
   if(y<103){end();start();}
   const take=Math.min(lines-offset,Math.max(1,Math.floor((y-67)/11)-1)),height=Math.max(26,take*11+12);
   if(index%2===1)rect(24,y-height,564,height,light);
   for(let col=0;col<3;col++)for(let i=0;i<take;i++)if(cells[col][offset+i])text(columns[col]+6,y-15-i*11,cells[col][offset+i],8.5,col===1);
   if(offset===0){right(columns[4]-7,y-16,row.income?amount(row.income):'-',9,true,green);right(columns[5]-7,y-16,row.expense?amount(row.expense):'-',9,true,orange);right(columns[6]-7,y-16,amount(row.balance),9,true);}
   for(const x of columns)rule(x,y,x,y-height);rule(24,y-height,588,y-height);
   y-=height;offset+=take;
  }
 }
 if(!journal.rows.length){text(34,y-22,'No hay movimientos registrados en este mes.',10);y-=40;}
 if(y<263){end();start(false,false);}
 y-=22;
 const boxWidth=(564-20)/3;
 [['TOTAL INGRESOS',journal.income,green],['TOTAL EGRESOS',journal.expense,orange],['RESULTADO DEL MES',journal.income-journal.expense,green]].forEach(([label,value,color],i)=>{
  const x=24+i*(boxWidth+10);rect(x,y-50,boxWidth,50,light);center(x+boxWidth/2,y-16,label,10,true);right(x+boxWidth-12,y-38,cash(value),15,true,color);
 });
 y-=65;rect(24,y-36,564,36,green);text(34,y-23,'SALDO FINAL DEL MES',13,true,'1 1 1');right(578,y-24,cash(journal.closing),18,true,'1 1 1');
 y-=56;text(34,y,'Saldo final = saldo inicial + ingresos - egresos.',9);y-=15;text(34,y,'Los movimientos anulados no se incluyen en este reporte.',9);
 y-=45;rule(67,y,267,y,green);rule(345,y,545,y,green);center(167,y-14,'Elaborado por',9);center(445,y-14,'Revisado por',9);
 end();
 for(let i=0;i<pages.length;i++)pages[i]=pages[i].replace(/__PAGES__/g,String(pages.length));
 const objects=[null,'<< /Type /Catalog /Pages 2 0 R >>',null,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
 const kids=[];
 for(const stream of pages){const page=objects.length,content=page+1;kids.push(page+' 0 R');objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${content} 0 R >>`);objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);}
 objects[2]=`<< /Type /Pages /Count ${kids.length} /Kids [${kids.join(' ')}] >>`;
 // PDF usa bytes Latin-1 para conservar español y offsets exactos.
 let pdf='%PDF-1.4\n',offsets=[0];for(let i=1;i<objects.length;i++){offsets[i]=pdf.length;pdf+=`${i} 0 obj\n${objects[i]}\nendobj\n`;}
 const xref=pdf.length;pdf+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return new Blob([Uint8Array.from(pdf,c=>c.charCodeAt(0)&255)],{type:'application/pdf'});
}
