import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./multi-date-abonos-ui.js',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf(' function mdNextCorrelativo('),source.indexOf(' function mdNextRow('));
const {mdNextCorrelativo,mdSuggestNextReference,mdSuggestNextAmount,mdRowHasPayment}=new Function(helpers+';return {mdNextCorrelativo,mdSuggestNextReference,mdSuggestNextAmount,mdRowHasPayment};')();
test('correlativo editable consecutivo y salto por recibo anulado',()=>{
 const a={receiptRef:'4408'},b={receiptRef:''},c={receiptRef:''};
 assert.equal(mdSuggestNextReference(a,b),true);
 assert.equal(b.receiptRef,'4409');
 assert.equal(mdRowHasPayment(b),false);
 b.receiptRef='4410';b.refEdited=true;b.refSuggested=false;
 assert.equal(mdSuggestNextReference(a,b),false);
 assert.equal(b.receiptRef,'4410');
 assert.equal(mdSuggestNextReference(b,c),true);
 assert.equal(c.receiptRef,'4411');
 assert.equal(mdRowHasPayment(c),false);
 c.dateText='25/11/26';assert.equal(mdRowHasPayment(c),true);
});
test('sin ceros iniciales, precisión entera y sin sobrescribir OCR o edición',()=>{
 assert.equal(mdNextCorrelativo('0004408'),'4409');
 assert.equal(mdNextCorrelativo('99999999999999999999'),'100000000000000000000');
 assert.equal(mdNextCorrelativo('abc'),'');
 assert.equal(mdNextCorrelativo('0'),'');
 assert.equal(mdNextCorrelativo('9'.repeat(80)),'');
 const ocr={receiptRef:'4500',refEdited:false,refSuggested:false};
 assert.equal(mdSuggestNextReference({receiptRef:'4408'},ocr),false);
 assert.equal(ocr.receiptRef,'4500');
 const auto={receiptRef:'4409',refSuggested:true};
 assert.equal(mdSuggestNextReference({receiptRef:'4410'},auto),true);
 assert.equal(auto.receiptRef,'4411');
});

test('monto sugerido se repite sin sumar una fila vacía y respeta correcciones',()=>{
 const first={amount:'6500'},second={amount:'',receiptRef:'4409',refSuggested:true},third={};
 assert.equal(mdSuggestNextAmount(first,second),true);
 assert.equal(second.amount,'6500');
 assert.equal(mdRowHasPayment(second),false);
 second.date='2026-04-23';assert.equal(mdRowHasPayment(second),true);
 second.amount='7000';second.amountEdited=true;second.amountSuggested=false;
 assert.equal(mdSuggestNextAmount(first,second),false);
 assert.equal(mdSuggestNextAmount(second,third),true);
 assert.equal(third.amount,'7000');assert.equal(mdRowHasPayment(third),false);
 const scanned={amount:'5500',photo:{}};assert.equal(mdSuggestNextAmount(first,scanned),false);
 assert.equal(mdSuggestNextAmount({amount:'-2'},{}),false);
});
