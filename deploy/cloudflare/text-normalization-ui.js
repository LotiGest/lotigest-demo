// LOTIGEST PRO — captura uniforme de texto y teléfonos (solo entradas editables).
// Las fichas y recibos guardados anteriormente no se reescriben.
(function installLotigestTextNormalization(){
 'use strict';
 const up=value=>String(value??'').toLocaleUpperCase('es-HN');
 function phone(raw){
  const text=String(raw??'').trim();
  if(!text)return '';
  const d=text.replace(/\D/g,'');
  // Honduras: ocho cifras locales, con o sin código 504.
  const hn=d.length===8?d:d.length===11&&d.startsWith('504')?d.slice(3):null;
  if(hn&&/^[2-9]\d{7}$/.test(hn))return '+504 '+hn.slice(0,4)+'-'+hn.slice(4);
  // EE. UU./NANP: diez cifras, con o sin código 1.
  const us=d.length===10?d:d.length===11&&d.startsWith('1')?d.slice(1):null;
  if(us&&/^[2-9]\d{9}$/.test(us))return '+1 ('+us.slice(0,3)+') '+us.slice(3,6)+'-'+us.slice(6);
  // No adivinar códigos de otros países ni cambiar números incompletos.
  return text;
 }
 function meta(el){
  return [el.name,el.id,el.type,el.getAttribute?.('autocomplete'),
   el.getAttribute?.('inputmode'),...Object.entries(el.dataset||{}).flat()]
   .filter(Boolean).join(' ').toLowerCase();
 }
 const skipText=/(email|correo|pass|contras|credential|usuario|username|token|secret|api.?key|url|uri|enlace|href|link|http|path|archivo|file|json|html|css|sql|(?:^|[_\s-])(?:script|code|c[oó]digo)(?:$|[_\s-])|date|fecha|time|hora|phone|tel[eé]?fono|mobile|celular|whatsapp|identity|identidad|dni|rtn|receiptref|correlativo|uuid|latitud|longitud|latitude|longitude|coordenad|geohash|gps)/i;
 function isPhone(el){
  if(!el||el.tagName!=='INPUT'||el.disabled||el.readOnly)return false;
  if(el.type==='tel')return true;
  const x=[el.name,el.id,...Object.entries(el.dataset||{}).flat()].filter(Boolean).join(' ');
  return /(phone|tel[eé]?fono|mobile|celular|whatsapp)/i.test(x);
 }
 function isHumanText(el){
  if(!el||el.disabled||el.readOnly||el.hasAttribute?.('data-preserve-case')||el.closest?.('[data-preserve-case]'))return false;
  const type=String(el.type||'').toLowerCase();
  if(el.tagName==='INPUT'&&!['text','search'].includes(type))return false;
  if(el.tagName!=='INPUT'&&el.tagName!=='TEXTAREA')return false;
  if(skipText.test(meta(el)))return false;
  return true;
 }
 function uppercaseInput(el){
  if(!isHumanText(el)||!el.value)return false;
  const original=String(el.value),updated=up(original);
  if(updated===original)return false;
  const a=el.selectionStart,b=el.selectionEnd;
  el.value=updated;
  try{
   if(a!=null&&b!=null)el.setSelectionRange(a,b);
  }catch{}
  return true;
 }
 function phoneInput(el){
  if(!isPhone(el))return false;
  const formatted=phone(el.value);
  if(formatted===el.value)return false;
  el.value=formatted;
  // Los módulos con borrador, como Nuevo contrato, escuchan input para guardarlo.
  el.dispatchEvent(new Event('input',{bubbles:true}));
  return true;
 }
 window.addEventListener('input',event=>{
  if(event.isComposing||event.target?.dataset?.preserveCase!==undefined)return;
  uppercaseInput(event.target);
 },true);
 window.addEventListener('compositionend',event=>{uppercaseInput(event.target);},true);
 window.addEventListener('change',event=>{
  if(isPhone(event.target))phoneInput(event.target);
  else uppercaseInput(event.target);
 },true);
 window.addEventListener('focusout',event=>{if(isPhone(event.target))phoneInput(event.target);},true);
 // En captura de WINDOW se ejecuta antes de cualquier manejador de DOCUMENT,
 // para que el borrador de Clientes y FormData reciban los valores definitivos.
 window.addEventListener('submit',event=>{
  const form=event.target;
  if(!form?.querySelectorAll)return;
  for(const input of form.querySelectorAll('input,textarea')){
   if(isPhone(input))phoneInput(input);
   else uppercaseInput(input);
  }
 },true);
 window.lotigestPhone={format:phone};
 window.lotigestUppercase={format:up,appliesTo:isHumanText};
})();
