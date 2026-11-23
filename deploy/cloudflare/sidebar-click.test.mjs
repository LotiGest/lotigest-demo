import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../prueba-diseno-v08.html',import.meta.url),'utf8');
const styles=readFileSync(new URL('./sidebar-click.css',import.meta.url),'utf8');
const build=readFileSync(new URL('./build.mjs',import.meta.url),'utf8');
const start=source.indexOf('/* Presentation-only actions; original data-page');
const end=source.indexOf('</script>',start);
assert.ok(start>=0&&end>start);
const behavior=source.slice(start,end);
function environment(){
 const listeners={},saved={},states=new Set();
 const makeButton=type=>{
  const attributes={};
  return {dataset:{lgAction:'pin'},title:'',textContent:type==='launcher'?'H':'›',
   classList:{contains:name=>type==='launcher'&&name==='lg-sidebar-launcher'},
   setAttribute:(key,value)=>{attributes[key]=value;},getAttribute:key=>attributes[key],
   closest:selector=>selector==='[data-lg-action]'?buttons[type]:null};
 };
 const buttons={launcher:null,pin:null};
 buttons.launcher=makeButton('launcher');buttons.pin=makeButton('pin');
 const sidebar={
  id:'lgSidebar',
  classList:{contains:name=>states.has(name),add:name=>states.add(name),remove:name=>states.delete(name),
   toggle:(name,force)=>{
    if(force===true)states.add(name);else if(force===false)states.delete(name);
    else if(states.has(name))states.delete(name);else states.add(name);
   }},
  querySelectorAll:selector=>selector==='[data-lg-action="pin"]'?[buttons.launcher,buttons.pin]:[]
 };
 const document={addEventListener:(name,fn)=>(listeners[name]??=[]).push(fn),
  getElementById:id=>id==='lgSidebar'?sidebar:null};
 const localStorage={getItem:key=>saved[key]||null,setItem:(key,value)=>{saved[key]=value}};
 new Function('document','localStorage',behavior)(document,localStorage);
 const click=button=>listeners.click.forEach(fn=>fn({target:button,stopPropagation(){},preventDefault(){}}));
 const leave=()=>listeners.pointerleave.forEach(fn=>fn({target:sidebar}));
 return {click,leave,buttons,sidebar,saved,states};
}
test('el icono H abre y cierra la barra lateral y el botón de fijar también funciona',()=>{
 const ui=environment();
 assert.match(source,/class="lg-company-icon lg-sidebar-launcher"/,'La H debe ser botón visible');
 assert.match(source,/aria-controls="lgSidebar"/);
 ui.click(ui.buttons.launcher);
 assert.equal(ui.states.has('pinned'),true);
 assert.equal(ui.buttons.launcher.getAttribute('aria-expanded'),'true');
 assert.equal(ui.buttons.launcher.textContent,'H');
 assert.equal(ui.buttons.pin.textContent,'◆');
 assert.equal(ui.saved['lotigest-v08-pin'],'true');
 ui.click(ui.buttons.pin);
 assert.equal(ui.states.has('pinned'),false);
 assert.equal(ui.states.has('lg-sidebar-just-closed'),true);
 assert.equal(ui.buttons.launcher.getAttribute('aria-expanded'),'false');
 assert.equal(ui.buttons.pin.textContent,'›');
 assert.equal(ui.saved['lotigest-v08-pin'],'false');
 ui.leave();
 assert.equal(ui.states.has('lg-sidebar-just-closed'),false);
});
test('estilos de barra desplegada prevalecen sobre reglas de colapso antiguas',()=>{
 assert.match(styles,/\\.lotigest-sidebar\\.pinned[\\s\\S]*?width:var\\(--lg-side-wide\\)!important/);
 assert.match(styles,/\\.lotigest-sidebar\\.pinned \\.lg-nav \\.nav-btn em/);
 assert.match(styles,/\\.lotigest-sidebar\\.pinned \\.lg-side-label/);
 assert.match(styles,/@media\\(hover:hover\\) and \\(pointer:fine\\)/);
 assert.match(styles,/\\.lotigest-sidebar:not\\(\\.pinned\\) \\.lg-sidebar-launcher/);
 assert.match(build,/files\\['sidebar-click.css'\\]/);
 assert.match(build,/href="\\/sidebar-click.css"/);
});
