// PDF carta sin dependencias de red: texto seleccionable, tablas y paginación.
export function contractSheetPdf(model){
 const pages=[];let commands=[],y=0;
 const clean=v=>String(v??'').replace(/[\u2013\u2014]/g,'-').replace(/[^\x20-\xFF\n]/g,' ');
 const escape=v=>clean(v).replace(/[\\()]/g,'\\$&');
 const text=(value,x,at,size=9,bold=false)=>commands.push(`0.08 0.13 0.10 rg BT /${bold?'F2':'F1'} ${size} Tf 1 0 0 1 ${x} ${at} Tm (${escape(value)}) Tj ET`);
 const wrap=(value,width,size=9)=>{const limit=Math.max(12,Math.floor(width/(size*.56))),lines=[];let line='';for(const word of clean(value||'No registrado').split(/\s+/)){if(line.length+word.length+1>limit&&line){lines.push(line);line='';}for(let i=0;i<word.length;i+=limit){const part=word.slice(i,i+limit);if(i+limit<word.length)lines.push(part);else line+=(line?' ':'')+part;}}if(line)lines.push(line);return lines.length?lines:['No registrado'];};
 const start=()=>{commands=[];text(String(model.residence||'LOTIGEST').toUpperCase(),34,752,15,true);text('FICHA DEL CLIENTE Y CONDICIONES DEL CONTRATO',34,733,10,true);text(model.company||'GRUPO H',34,717,9);y=699;};
 const end=()=>{text('LOTIGEST | Documento privado | No acredita pagos recibidos',34,24,8);text('Página '+(pages.length+1),523,24,8);pages.push(commands.join('\n'));};
 const space=h=>{if(y-h<48){end();start();}};
 const section=title=>{space(55);commands.push(`0.91 0.94 0.91 rg 34 ${y-17} 544 20 re f`);text(title,42,y-12,10,true);y-=23;};
 const row=(label,value)=>{
  const left=wrap(label,155,9),right=wrap(value,363,9),count=Math.max(left.length,right.length);
  // Dividir una observación excepcionalmente larga entre páginas sin perder texto.
  for(let offset=0;offset<count;){const capacity=Math.max(1,Math.floor((y-58)/12));if(y<82){end();start();continue;}const take=Math.min(count-offset,capacity),height=Math.max(18,take*11+6);space(height);
   commands.push(`0.35 0.40 0.36 RG 0.5 w 34 ${y-height} 544 ${height} re S 201 ${y-height} m 201 ${y} l S`);
   for(let i=0;i<take;i++){if(left[offset+i])text(left[offset+i],41,y-12-i*11,9,true);if(right[offset+i])text(right[offset+i],208,y-12-i*11);}
   y-=height;offset+=take;
  }
 };
 start();for(const group of model.sections){section(group.title);for(const [label,value] of group.rows)row(label,value);y-=5;}
 space(59);text('FIRMA DE AUTORIZACIÓN',34,y-12,10,true);commands.push(`0.35 0.40 0.36 RG 0.5 w 34 ${y-57} 544 35 re S`);end();
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids ['+pages.map((_,i)=>(5+i*2)+' 0 R').join(' ')+'] /Count '+pages.length+' >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
 for(const [i,stream] of pages.entries()){objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents '+(6+i*2)+' 0 R >>','<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream');}
 let pdf='%PDF-1.4\n';const offsets=[0];objects.forEach((o,i)=>{offsets.push(pdf.length);pdf+=(i+1)+' 0 obj\n'+o+'\nendobj\n';});const xref=pdf.length;pdf+='xref\n0 '+offsets.length+'\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';return new Blob([Uint8Array.from(pdf,c=>c.charCodeAt(0)&255)],{type:'application/pdf'});
}
