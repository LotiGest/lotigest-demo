// Presentación global de montos. Los formularios conservan números sin separadores.
(function installGlobalMoney(){
 'use strict';
 const monetaryNames=new Set(['amount','price','down','downpayment','prima','financed','monthly','openingpaid','pricepervara','purchaseprice','cost','capital','balance','total','income','expense','paidamount','initialpayment','reserveamount','unitprice','saleprice','initialbalance']);
 const excluded=/^(?:id|identity|phone|pin|year|month|months|date|stage|block|number|paid|quantity|area|aream2|areavaras|rate|interest|installments)$/i;
 const wired=new WeakMap();let scheduled=false;
 function isReference(input){return /^(?:primaref|receiptref|receiptreference|receiptreferencenormalized|reference|receiptnumber|invoiceref|vouchernumber|correlativo|folio)$/i.test(input.name||'')||input.dataset.mdField==='receiptRef'||/correlativo/i.test(input.getAttribute('aria-label')||'');}
 function isMoney(input){
  if(isReference(input)||excluded.test(input.name||'')||['hidden','date','month','checkbox','radio','file','password','tel','email','search'].includes(input.type))return false;
  if(input.matches('[data-pm-currency],.pm-currency-visible,[data-lg-money-display]'))return false;
  if(input.dataset.mdField==='amount')return true;
  const key=(input.name||'').toLowerCase();
  if(monetaryNames.has(key)||/^(?:solarprice_|solardown_)\d+$/.test(key))return true;
  if(input.matches('[data-payment-amount],[data-owner-statement],#pm-client-total'))return true;
  const label=input.labels?.[0]?.textContent||input.getAttribute('aria-label')||'';
  return /(?:monto|importe|precio|capital|saldo|costo|prima|cuota mensual)/i.test(label)&&!/(?:fecha|tel[eé]fono|identidad|n[uú]mero|cantidad|meses|porcentaje|cuotas completas)/i.test(label);
 }
 function parse(raw){
  let value=String(raw??'').trim().replace(/^(?:HNL|LPS\.?|L\.?)\s*/i,'').replace(/\s/g,'');
  if(!value)return {value:'',display:'',error:''};
  if(!/^-?[\d.,]+$/.test(value))return {value:'',display:String(raw),error:'Escribe un monto válido en lempiras.'};
  // Admite el punto decimal y pegado europeo 1.234,56; al escribir muestra 1,234.56.
  if(value.includes('.')&&value.lastIndexOf(',')>value.lastIndexOf('.'))value=value.replace(/\./g,'').replace(',','.');
  else value=value.replace(/,/g,'');
  if(!/^-?\d*(?:\.\d{0,2})?$/.test(value))return {value:'',display:String(raw),error:'El monto admite hasta dos decimales.'};
  const negative=value.startsWith('-'),parts=value.replace(/^-/,'').split('.');
  const whole=(parts[0]||'0').replace(/^0+(?=\d)/,'');
  const number=(negative?'-':'')+whole+(parts.length>1&&parts[1]?'.'+parts[1]:'');
  if(!Number.isFinite(Number(number))||!Number.isSafeInteger(Math.round(Number(number)*100)))return {value:'',display:String(raw),error:'El monto es demasiado grande.'};
  return {value:number,display:(negative?'-':'')+whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(parts.length>1?'.'+parts[1]:''),error:''};
 }
 function format(raw){const parsed=parse(raw);return !parsed.value||parsed.error?parsed.display:new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(parsed.value));}
 function markReference(input){
  input.classList.add('lg-correlative-input');
  if(input.dataset.lgCorrelativeReady)return;input.dataset.lgCorrelativeReady='yes';
  input.addEventListener('input',()=>{if(input.value.includes(',')){input.value=input.value.replace(/,/g,'');input.dispatchEvent(new Event('input',{bubbles:true}));}},true);
 }
 function decorate(native){
  if(wired.has(native)){wired.get(native).sync();return;}
  if(native.dataset.mdField==='amount'){native.classList.add('lg-money-input');return;}
  if(native.dataset.pmCurrencyPrepared==='yes'||native.closest('.pm-currency-control'))return;
  const required=native.required,labels=[...(native.labels||[])],widget=document.createElement('span'),symbol=document.createElement('span'),visible=document.createElement('input');
  widget.className='lg-money-control';symbol.className='lg-money-symbol';symbol.textContent='L';symbol.setAttribute('aria-hidden','true');
  visible.type='text';visible.inputMode='decimal';visible.autocomplete='off';visible.spellcheck=false;
  visible.className='lg-money-input';visible.dataset.lgMoneyDisplay='yes';visible.placeholder='0.00';visible.required=required;
  visible.setAttribute('aria-label',native.getAttribute('aria-label')||labels[0]?.querySelector('span')?.textContent||labels[0]?.textContent.trim()||'Monto en lempiras');
  if(native.id){visible.id=native.id+'-money-display';for(const label of labels)if(label.htmlFor===native.id)label.htmlFor=visible.id;}
  const initial=native.value;native.dataset.lgMoneyRaw='yes';native.type='hidden';
  native.before(widget);widget.append(symbol,visible,native);
  let updating=false,currentError='';
  function validate(error=''){
   const n=Number(native.value);
   if(!error&&native.value!==''&&native.min!==''&&Number.isFinite(Number(native.min))&&n<Number(native.min))error='El monto mínimo es '+format(native.min)+'.';
   if(!error&&native.value!==''&&native.max!==''&&Number.isFinite(Number(native.max))&&n>Number(native.max))error='El monto máximo es '+format(native.max)+'.';
   visible.setCustomValidity(error);visible.setAttribute('aria-invalid',String(Boolean(error)));
  }
  function sync(){
   if(visible.required!==native.required)visible.required=native.required;
   if(visible.disabled!==native.disabled)visible.disabled=native.disabled;
   if(visible.readOnly!==native.readOnly)visible.readOnly=native.readOnly;
   if(!updating&&document.activeElement!==visible)visible.value=format(native.value);
   validate(currentError);
  }
  wired.set(native,{sync});
  visible.addEventListener('input',()=>{
   const text=visible.value,caret=visible.selectionStart??text.length,parsed=parse(text);
   const chars=text.slice(0,caret).replace(/,/g,'').length;
   visible.value=parsed.display;let position=0,count=0;
   while(position<visible.value.length&&count<chars){if(visible.value[position]!==',')count++;position++;}
   visible.setSelectionRange(position,position);
   currentError=parsed.error;updating=true;native.value=parsed.value;native.dispatchEvent(new Event('input',{bubbles:true}));updating=false;validate(parsed.error);
  });
  visible.addEventListener('change',()=>{native.dispatchEvent(new Event('change',{bubbles:true}));});
  visible.addEventListener('blur',()=>{if(!visible.validationMessage)visible.value=format(native.value);});
  const changed=()=>{if(!updating)currentError='';sync();};
  native.addEventListener('input',changed);native.addEventListener('change',changed);
  native.value=initial;sync();
 }
 function scan(){
  scheduled=false;
  for(const input of document.querySelectorAll('input')){
   if(isReference(input))markReference(input);
   else if(wired.has(input))wired.get(input).sync();
   else if(isMoney(input))decorate(input);
  }
 }
 function schedule(){if(!scheduled){scheduled=true;queueMicrotask(scan);}}
 new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','readonly','required','min','max']});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan,{once:true});else scan();
 window.lotigestMoney={scan,parse,format,isMoney,isReference};
})();
