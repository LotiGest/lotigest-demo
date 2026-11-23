// Entradas monetarias en lempiras. La vista usa "L 10,000.00", el formulario conserva "10000.00".
// Los pagos de varios solares, comprobantes OCR y validaciones de D1 utilizan el valor numérico original.
function pmLempiraParts(raw){
 const cleaned=String(raw??'').replace(/[^\d.,]/g,'');
 const commaDecimal=/,\d{1,2}$/.test(cleaned)&&cleaned.includes('.')&&cleaned.lastIndexOf(',')>cleaned.lastIndexOf('.');
 const decimalSeparator=commaDecimal?',':'.';
 const pos=cleaned.indexOf(decimalSeparator);
 const hasDecimal=pos!==-1&&(decimalSeparator==='.'||commaDecimal);
 const before=hasDecimal?cleaned.slice(0,pos):cleaned;
 const after=hasDecimal?cleaned.slice(pos+1):'';
 const digits=before.replace(/\D/g,'').slice(0,12);
 const fraction=after.replace(/\D/g,'').slice(0,2);
 if(!digits&&!fraction)return {raw:'',display:'',value:''};
 const whole=(digits||'0').replace(/^0+(?=\d)/,'');
 const grouped=whole.replace(/\B(?=(\d{3})+(?!\d))/g,',');
 return {raw:cleaned,display:grouped+(hasDecimal?'.'+fraction:''),value:whole+(hasDecimal&&fraction?'.'+fraction:'')};
}
function pmLempiraFormat(raw){
 const parsed=pmLempiraParts(raw);
 if(!parsed.value)return '';
 const number=Number(parsed.value);
 if(!Number.isFinite(number))return parsed.display;
 return new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(number);
}
function pmMoneyDecorate(){
 const modal=document.querySelector('#modal-root .lg-payment-modern');
 if(!modal)return;
 const targets=[...modal.querySelectorAll('#multi-payment-form [data-payment-amount],#multi-payment-form #pm-client-total,#owner-abono-form [data-owner-statement],#manual-history-form [name="amount"]')];
 for(const native of targets){
  if(native.dataset.pmCurrencyPrepared==='yes'||native.dataset.lgMoneyRaw==='yes')continue;
  native.dataset.pmCurrencyPrepared='yes';
  const form=native.closest('form'),mandatory=native.required;
  const widget=document.createElement('div');
  widget.className='pm-currency-control';
  const symbol=document.createElement('span');
  symbol.className='pm-currency-symbol';symbol.textContent='L';
  symbol.setAttribute('aria-hidden','true');
  const visible=document.createElement('input');
  visible.type='text';visible.inputMode='decimal';visible.autocomplete='off';
  visible.spellcheck=false;visible.className='pm-currency-visible';
  visible.placeholder='0.00';visible.required=mandatory;
  visible.setAttribute('aria-label','Monto en lempiras');
  visible.setAttribute('data-pm-currency','true');
  if(native.max)visible.dataset.maxAmount=native.max;
  const current=native.value;
  // El campo original mantiene su nombre y atributos de lote para FormData y la lógica de cuotas.
  native.type='hidden';native.required=false;
  native.classList.add('pm-currency-raw');
  native.before(widget);widget.append(symbol,visible,native);
  let updating=false;
  const syncDisplay=()=>{
   if(updating)return;
   visible.value=pmLempiraFormat(native.value);
  };
  visible.addEventListener('input',()=>{
   const before=visible.value,caret=visible.selectionStart??before.length;
   const parsed=pmLempiraParts(before);
   const prefix=pmLempiraParts(before.slice(0,caret)).display;
   visible.value=parsed.display;
   try{visible.setSelectionRange(prefix.length,prefix.length);}catch{}
   updating=true;
   native.value=parsed.value;
   native.dispatchEvent(new Event('input',{bubbles:true}));
   updating=false;
  });
  visible.addEventListener('blur',()=>{visible.value=pmLempiraFormat(native.value);});
  native.addEventListener('input',syncDisplay);
  native.addEventListener('change',syncDisplay);
  visible.value=pmLempiraFormat(current);
  // La validación ordinaria del navegador y la validación de importe del sistema siguen activas.
  if(mandatory)visible.setAttribute('aria-required','true');
  // Una comprobación adicional antes del envío asegura que el valor subyacente está actualizado.
  form?.addEventListener('submit',()=>{
   if(visible.value&&native.value===''){
    native.value=pmLempiraParts(visible.value).value;
   }
  },{capture:true});
 }
}
const pmCurrencyPreviousShowModal=showModal;
showModal=function(title,content,footer='',wide=false,subtitle=''){
 const result=pmCurrencyPreviousShowModal(title,content,footer,wide,subtitle);
 pmMoneyDecorate();return result;
};
const pmCurrencyPreviousSelected=renderPaymentSelected;
renderPaymentSelected=function(){
 const result=pmCurrencyPreviousSelected();
 pmMoneyDecorate();return result;
};
