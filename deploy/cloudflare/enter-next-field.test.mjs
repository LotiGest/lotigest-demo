import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('./enter-next-field-ui.js',import.meta.url),'utf8');
const build=readFileSync(new URL('./build.mjs',import.meta.url),'utf8');

function env(){
 const callbacks={keydown:[],keyup:[]},scope={fields:[],querySelectorAll(){return this.fields;},contains(el){return el===this||this.fields.includes(el);}};
 const window={
  addEventListener:(name,handler)=>callbacks[name].push(handler),
  getComputedStyle:el=>({display:'block',visibility:'visible',opacity:el.opacity??'1'})
 };
 const document={body:scope};
 new Function('window','document',source)(window,document);
 let focus=null;
 function field(name,options={}){
  const o={
   id:name,tagName:options.tagName||'INPUT',type:options.type||'text',
   multiple:false,disabled:false,readOnly:false,hidden:false,inert:false,
   classList:{contains:x=>Boolean(options.nativeCalendar)&&x==='md-native-date'},
   getAttribute:key=>key==='role'?options.role||null:key==='tabindex'?options.tabindex??null:null,
   closest:selector=>selector==='form'?scope:selector.startsWith('#modal-root')?null:selector.startsWith('main')?scope:null,
   getClientRects:()=>options.invisible?[]:[{}],
   focus:()=>{focus=name;},
   select(){this.selected=true;}
  };
  Object.assign(o,options);
  scope.fields.push(o);
  return o;
 }
 function key(target,kind='keydown',extra={}){
  const e={target,key:'Enter',repeat:false,defaultPrevented:false,
   preventDefault(){this.defaultPrevented=true;},...extra};
  for(const handler of callbacks[kind])handler(e);
  return e;
 }
 return {window,document,field,key,scope,focus:()=>focus};
}

test('Enter avanza a la siguiente casilla visible del formulario, sin guardarlo',()=>{
 const x=env();
 const name=x.field('nombre');
 x.field('archivo',{type:'file'});
 x.field('invisible',{hidden:true});
 x.field('calendario-sobrepuesto',{type:'date',nativeCalendar:true});
 const identity=x.field('identidad',{type:'number'});
 const email=x.field('correo',{type:'email'});
 assert.equal(x.key(name).defaultPrevented,true);
 assert.equal(x.focus(),'identidad');
 assert.equal(identity.selected,true);
 assert.equal(x.key(identity).defaultPrevented,true);
 assert.equal(x.focus(),'correo');
 assert.equal(x.key(email).defaultPrevented,true,'Al terminar el último campo se evita el envío automático');
 assert.equal(x.focus(),'correo');
});
test('si ya existe un manejador de Enter para Abonos varios/búsqueda se respeta',()=>{
 const x=env(),a=x.field('fecha'),b=x.field('monto');
 const handled=x.key(a,'keydown',{defaultPrevented:true});
 assert.equal(handled.defaultPrevented,true);
 assert.equal(x.focus(),null,'La navegación global no sobrescribe el manejador local');
 assert.equal(x.key(a,'keydown',{ctrlKey:true}).defaultPrevented,false);
 assert.equal(x.key(a,'keydown',{isComposing:true}).defaultPrevented,false);
 assert.equal(x.key(a,'keydown',{repeat:true}).defaultPrevented,false);
 assert.equal(x.key(a,'keydown',{shiftKey:true}).defaultPrevented,false);
 assert.ok(b);
});
test('textareas admiten Shift+Enter para salto de línea; Enter avanza',()=>{
 const x=env(),notes=x.field('observación',{tagName:'TEXTAREA'}),next=x.field('fecha',{type:'date'});
 assert.equal(x.key(notes,'keydown',{shiftKey:true}).defaultPrevented,false);
 assert.equal(x.focus(),null);
 assert.equal(x.key(notes).defaultPrevented,true);
 assert.equal(x.focus(),'fecha');
 assert.ok(next);
});
test('selecciones reciben Enter nativo primero y después avanzan al siguiente campo',()=>{
 const x=env(),choice=x.field('bloque',{tagName:'SELECT'}),solar=x.field('solar');
 assert.equal(x.key(choice,'keydown').defaultPrevented,false);
 assert.equal(x.focus(),null);
 assert.equal(x.key(choice,'keyup').defaultPrevented,true);
 assert.equal(x.focus(),'solar');
 assert.ok(solar);
});
test('el botón de guardar, casillas radio y entradas técnicas no son afectadas',()=>{
 const x=env(),radio=x.field('estado',{type:'radio'}),button=x.field('guardar',{type:'submit'}),textbox=x.field('nombre');
 assert.equal(x.key(radio).defaultPrevented,false);
 assert.equal(x.key(button).defaultPrevented,false);
 assert.equal(x.key(textbox).defaultPrevented,true);
 assert.ok(x.window.lotigestEnterNext.installed);
});
test('inicio de sesión conserva Enter para ingresar al terminar la contraseña',()=>{
 const x=env();x.scope.matches=sel=>sel==='#login-form';
 const user=x.field('usuario'),pass=x.field('contrasena',{type:'password'});
 assert.equal(x.key(user).defaultPrevented,true);
 assert.equal(x.focus(),'contrasena');
 assert.equal(x.key(pass).defaultPrevented,false,'La contraseña final puede enviar el login');
});
test('no salta a otro formulario al llegar a la última casilla',()=>{
 const x=env(),first=x.field('primer-formulario'),other=x.field('segundo-formulario');
 x.scope.fields=[first];
 const secondScope={querySelectorAll:()=>[other],contains:()=>true};
 other.closest=sel=>sel==='form'?secondScope:null;
 assert.equal(x.key(first).defaultPrevented,true);
 assert.equal(x.focus(),null,'No cambia a campos de otro formulario');
});
test('script se integra al compilador al final, después de Abonos varios y atajos',()=>{
 const md=build.indexOf("'./multi-date-abonos-ui.js'");
 const shortcuts=build.indexOf("'./shortcut-settings-ui.js'");
 const global=build.indexOf("'./enter-next-field-ui.js'");
 assert.ok(md>=0&&shortcuts>md&&global>shortcuts);
});
