/* LOTIGEST PRO · Enter avanza al siguiente campo sin activar Guardar.
 * Se instala en window/burbuja para respetar los manejadores específicos
 * de búsqueda, OCR, atajos y Abonos varios que ya consumen Enter.
 */
(function installLotigestEnterNextField(){
 'use strict';
 if(window.lotigestEnterNext?.installed)return;
 const selector='input,select,textarea';
 const nativeInputTypes=new Set(['text','search','number','date','datetime-local','month','week','time','tel','email','url','password']);
 const selectableTypes=new Set(['text','search','number','tel','email','url']);
 function eligible(element){
  if(!element||!element.tagName)return false;
  const tag=element.tagName.toLowerCase();
  if(!['input','select','textarea'].includes(tag))return false;
  if(tag==='input'&&!nativeInputTypes.has(String(element.type||'text').toLowerCase()))return false;
  if(tag==='select'&&element.multiple)return false;
  if(element.disabled||element.readOnly||element.hidden||element.inert)return false;
  if(element.getAttribute?.('tabindex')==='-1'||element.getAttribute?.('aria-hidden')==='true')return false;
  if(element.closest?.('[hidden],[inert],[aria-hidden="true"],[data-enter-next="off"],[data-shortcut-capture],[contenteditable="true"]'))return false;
  // Evitar campos de calendario superpuestos, pero invisibles.
  if(element.classList?.contains('md-native-date'))return false;
  if(typeof element.getClientRects==='function'&&!element.getClientRects().length)return false;
  if(typeof window.getComputedStyle==='function'){
   const style=window.getComputedStyle(element);
   if(style&&(style.display==='none'||style.visibility==='hidden'||(style.opacity!==''&&Number(style.opacity)<.1)))return false;
  }
  return true;
 }
 function scopeOf(input){
  const modal=input.closest?.('#modal-root .modal,dialog[open],[role="dialog"],.lg-contract-modern');
  const form=input.closest?.('form');
  if(modal)return form&&modal.contains(form)?form:modal;
  if(form)return form;
  return input.closest?.('main,[role="main"],.page-content,.page-panel,#app')||document.body;
 }
 function navigate(input){
  if(!eligible(input))return false;
  const scope=scopeOf(input);
  if(!scope?.querySelectorAll)return false;
  const fields=[...scope.querySelectorAll(selector)].filter(eligible);
  const position=fields.indexOf(input);
  if(position<0)return false;
  // Consumir Enter incluso en la última casilla: nunca enviar un formulario
  // ni guardar un pago automáticamente por una pulsación accidental.
  const next=fields[position+1];
  // El inicio de sesión conserva Enter para acceder después de la contraseña.
  if(!next&&scope.matches?.('#login-form'))return false;
  if(next){
   next.focus({preventScroll:false});
   if(next.tagName?.toLowerCase()==='input'&&selectableTypes.has(String(next.type||'text').toLowerCase())){
    try{next.select?.();}catch{}
   }
  }
  return true;
 }
 function standard(event){
  if(event.defaultPrevented||event.isComposing||event.repeat||event.ctrlKey||event.altKey||event.metaKey||event.shiftKey)return false;
  if(event.key!=='Enter')return false;
  const target=event.target;
  if(!target||target.isContentEditable||target.getAttribute?.('role')==='combobox')return false;
  return true;
 }
 // Inputs y observaciones: Enter avanza, Shift+Enter sigue haciendo saltos
 // de línea en textareas; los botones mantienen su comportamiento habitual.
 window.addEventListener('keydown',event=>{
  if(!standard(event))return;
  const input=event.target;
  if(input?.tagName?.toLowerCase()==='select')return; // No bloquear el menú nativo.
  if(navigate(input))event.preventDefault();
 },false);
 // Los desplegables procesan primero la selección con Enter y después
 // llevan al siguiente campo; así no se impide abrir/elegir una opción.
 window.addEventListener('keyup',event=>{
  if(!standard(event))return;
  if(event.target?.tagName?.toLowerCase()!=='select')return;
  if(navigate(event.target))event.preventDefault();
 },false);
 window.lotigestEnterNext={installed:true,eligible,navigate};
})();
