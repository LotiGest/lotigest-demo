import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const intake=readFileSync(new URL('./contract-intake-ui.js',import.meta.url),'utf8');
const history=readFileSync(new URL('./payment-history-ui.js',import.meta.url),'utf8');
const start=intake.indexOf('function contractSuggestedFirstDue(');
const api=new Function(intake.slice(start,intake.indexOf("document.addEventListener('change',event=>",start))+';return {contractSuggestedFirstDue,contractSuggestDueInput};')();
test('primera cuota se propone desde el contrato y respeta una fecha pactada manual',()=>{
 const form={elements:{date:{value:'2024-05-14'},firstDueDate:{value:'',dataset:{}}}};
 api.contractSuggestDueInput(form,'date');assert.equal(form.elements.firstDueDate.value,'2024-06-14');
 assert.equal(api.contractSuggestedFirstDue('2024-01-31'),'2024-02-29');
 assert.equal(api.contractSuggestedFirstDue('2025-01-31'),'2025-02-28');
 form.elements.firstDueDate.value='2024-07-20';api.contractSuggestDueInput(form,'firstDueDate');
 form.elements.date.value='2024-06-14';api.contractSuggestDueInput(form,'date');
 assert.equal(form.elements.firstDueDate.value,'2024-07-20');
 assert.match(intake,/record\.structured=\{\.\.\.record\.structured,date,firstDueDate\}/);
});
test('primer abono tardío no cambia el cronograma: junio queda vencido si julio es pagado',()=>{
 const project=new Function('pmHistoryReference',history.slice(history.indexOf('function pmReportCurrentMonthFirst('),history.indexOf('function pmFutureCoverage('))+';return pmReportCurrentMonthFirst;')(p=>p.receiptReference);
 const rows=[{saleId:'S',dueDate:'2024-06-14',dueCents:650000,receipts:[{paymentId:'P',amountCents:650000,date:'2024-07-14'}]},{saleId:'S',dueDate:'2024-07-14',dueCents:650000,receipts:[]},{saleId:'S',dueDate:'2024-08-14',dueCents:650000,receipts:[]}];
 const payments=[{id:'P',saleId:'S',date:'2024-07-14',amount:6500,receiptReference:'4402'}];
 const before=JSON.stringify({rows,payments}),result=project(rows,payments,'2024-07-15');
 assert.equal(result[0].status,'late');assert.equal(result[0].remainingCents,650000);
 assert.equal(result[1].remainingCents,0);assert.equal(result[2].remainingCents,650000);
 assert.equal(JSON.stringify({rows,payments}),before);
});
