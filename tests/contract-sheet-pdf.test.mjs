import test from 'node:test';import assert from 'node:assert/strict';import {contractSheetPdf} from '../contract-sheet-pdf.mjs';
test('PDF conserva todos los renglones y pagina observaciones largas sin perder el final',async()=>{
 const blob=contractSheetPdf({company:'GRUPO H',residence:'ALTOS DEL ARRAYÁN',sections:[{title:'GENERALES DE CLIENTE',rows:[['NOMBRE','CLIENTE FICTICIO'],['DNI','0801 1990 00021']]},{title:'OBSERVACIONES',rows:[['OBSERVACIONES',('Texto de observación larga. '.repeat(250))+'MARCADOR-FINAL-VERIFICADO']]}]});
 const text=Buffer.from(await blob.arrayBuffer()).toString('latin1');assert.ok(text.startsWith('%PDF-1.4'));assert.match(text,/MARCADOR-FINAL-VERIFICADO/);assert.match(text,/FIRMA DE AUTORIZACIÓN/);assert.ok(Number(/\/Count (\d+)/.exec(text)[1])>1);assert.doesNotMatch(text,/PAGO RECIBIDO/);
 for(const m of text.matchAll(/1 0 0 1 ([\d.]+) ([\d.]+) Tm/g)){assert.ok(Number(m[1])>=0&&Number(m[1])<612);assert.ok(Number(m[2])>0&&Number(m[2])<792);}
});
