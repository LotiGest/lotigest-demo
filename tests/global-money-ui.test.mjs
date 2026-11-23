import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const code=readFileSync(new URL('../deploy/cloudflare/global-money-ui.js',import.meta.url),'utf8');
function boot(body){const dom=new JSDOM(body,{runScripts:'outside-only'});dom.window.eval(code);dom.window.lotigestMoney.scan();return {w:dom.window,d:dom.window.document,close:()=>dom.window.close()};}
const input=(w,el,value)=>{el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));};
test('contratos y gastos: miles al escribir, monto numérico original y decimales al salir',()=>{
 const {w,d,close}=boot('<form><label>Precio<input name="price" type="number" min="0" required></label><label>Monto<input name="amount" type="number" min="0" max="2000000"></label></form>');
 try{
  const price=d.querySelector('[name=price]'),visible=price.closest('.lg-money-control').querySelector('[data-lg-money-display]');let events=0;price.addEventListener('input',()=>events++);
  input(w,visible,'1000000');assert.equal(visible.value,'1,000,000');assert.equal(price.value,'1000000');assert.equal(events,1);
  visible.dispatchEvent(new w.Event('blur'));assert.equal(visible.value,'1,000,000.00');assert.equal(new w.FormData(d.querySelector('form')).get('price'),'1000000');
  input(w,visible,'12500.75');assert.equal(visible.value,'12,500.75');assert.equal(price.value,'12500.75');
  const amount=d.querySelector('[name=amount]'),amountView=amount.closest('.lg-money-control').querySelector('[data-lg-money-display]');
  input(w,amountView,'2000001');assert.equal(amountView.checkValidity(),false);assert.match(amountView.validationMessage,/máximo/);
  input(w,amountView,'-1');assert.equal(amountView.checkValidity(),false);input(w,amountView,'');assert.equal(amountView.checkValidity(),true);
  input(w,visible,'12.345');assert.equal(visible.checkValidity(),false);w.lotigestMoney.scan();assert.equal(visible.checkValidity(),false,'No borra un error mientras se re-renderizan otras secciones');
 }finally{close();}
});
test('correlativos en rojo, sin comas ni pérdida de ceros; meses, áreas y DNI no cambian',()=>{
 const {w,d,close}=boot('<form><input name="primaRef" value="00006159"><input name="receiptRef"><input name="months" type="number" value="60"><input name="area" type="number" value="200"><input name="identity" value="0801199900001"><input name="phone" value="98035773"></form>');
 try{
  const ref=d.querySelector('[name=primaRef]');assert.ok(ref.classList.contains('lg-correlative-input'));assert.equal(ref.value,'00006159');
  input(w,ref,'0000,6159');assert.equal(ref.value,'00006159');assert.equal(d.querySelectorAll('[data-lg-money-display]').length,0);
  assert.equal(d.querySelector('[name=months]').type,'number');assert.equal(d.querySelector('[name=area]').value,'200');assert.equal(d.querySelector('[name=identity]').value,'0801199900001');
 }finally{close();}
});
test('campos dinámicos se decoran una vez y respetan solo lectura y actualizaciones numéricas',async()=>{
 const {w,d,close}=boot('<form id="f"></form>');try{
  d.querySelector('form').innerHTML='<label>Prima<input name="solarDown_2" type="number" value="10000"></label><label>Saldo<input name="financed" type="number" readonly value="1000000"></label>';
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(d.querySelectorAll('[data-lg-money-display]').length,2);w.lotigestMoney.scan();assert.equal(d.querySelectorAll('[data-lg-money-display]').length,2);
  const raw=d.querySelector('[name=financed]'),view=raw.closest('.lg-money-control').querySelector('[data-lg-money-display]');assert.equal(view.readOnly,true);assert.equal(view.value,'1,000,000.00');
  raw.value='900000';raw.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(view.value,'900,000.00');
  raw.disabled=true;await new Promise(resolve=>setTimeout(resolve,0));assert.equal(view.disabled,true);
  raw.required=true;await new Promise(resolve=>setTimeout(resolve,0));assert.equal(view.required,true);
 }finally{close();}
});
test('no duplica campos ya formateados de abonos normales y varios',()=>{
 const {w,d,close}=boot('<div class="pm-currency-control"><input class="pm-currency-visible" data-pm-currency><input type="hidden" name="amount" data-pm-currency-prepared="yes"></div><input data-md-field="amount" value="10,000.00"><input data-md-field="receiptRef" value="00006159">');
 try{assert.equal(d.querySelectorAll('[data-lg-money-display]').length,0);assert.ok(d.querySelector('[data-md-field=amount]').classList.contains('lg-money-input'));assert.ok(d.querySelector('[data-md-field=receiptRef]').classList.contains('lg-correlative-input'));}finally{close();}
});
test('parseo conserva millones y centavos y admite pegado europeo sin redondear silenciosamente',()=>{
 const {w,close}=boot('');try{
  assert.equal(w.lotigestMoney.parse('1,000,000.50').value,'1000000.50');assert.equal(w.lotigestMoney.parse('1.234,56').value,'1234.56');assert.equal(w.lotigestMoney.format('1000000'),'1,000,000.00');assert.ok(w.lotigestMoney.parse('999999999999999999').error);
 }finally{close();}
});

test('abonos: borrar un dígito de 1,000 deja 100, sin convertir miles a decimales',()=>{
 const source=readFileSync(new URL('../deploy/cloudflare/payment-money-ui.js',import.meta.url),'utf8');
 const api=new Function(source.slice(0,source.indexOf('function pmMoneyDecorate('))+';return {pmLempiraParts};')();
 assert.equal(api.pmLempiraParts('1,00').value,'100');assert.equal(api.pmLempiraParts('10,00').value,'1000');assert.equal(api.pmLempiraParts('1,000,000.50').value,'1000000.50');
});
