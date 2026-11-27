import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

function setup({width=360,zoom=100,fit=false,box='0 0 100 200',yaw=-6}={}){
 const code=readFileSync(new URL('./solar-touch-zoom.js',import.meta.url),'utf8');
 const svg={style:{},getAttribute:key=>key==='viewBox'?box:null};
 const viewport={
  clientWidth:width,clientHeight:540,clientLeft:0,clientTop:0,
  scrollLeft:200,scrollTop:250,style:{getPropertyValue:()=>String(yaw)+'deg'},classList:{contains:name=>fit&&['lg-scope-fit','lg-3d-mode'].includes(name)},
  contains:el=>el===svg,getBoundingClientRect:()=>({left:0,top:0})
 };
 const label={textContent:''},listeners=new Map();
 const document={
  getElementById:id=>({'arrayan-scroll':viewport,'arrayan-native':svg,'arrayan-zoom-label':label})[id],
  addEventListener:(type,fn)=>{listeners.set(type,fn)}
 };
 const env=new Function('document','arrayanZoom','arrayanSetZoom','render','listeners',code+';return {zoom:()=>arrayanZoom,zoomAt:solarTouchZoomAt,sync:solarTouchSync,render,events:listeners};');
 const touch=env(document,zoom,()=>{},()=>{},listeners);
 const target={closest:selector=>selector==='#arrayan-scroll'?viewport:null};
 return {touch,viewport,svg,label,target};
}
const finger=(x,y)=>({clientX:x,clientY:y});
test('mapa móvil: no mantiene ancho mínimo fijo y los botones siguen funcionando',()=>{
 const {touch,viewport,svg,label}=setup();
 touch.render();
 assert.equal(svg.style.minWidth,'0px');
 assert.equal(svg.style.width,'700px');
 touch.zoomAt(200);
 assert.equal(touch.zoom(),200);
 assert.equal(svg.style.width,'1400px');
 assert.equal(viewport.scrollLeft,580,'El centro visible queda fijo horizontalmente');
 assert.equal(viewport.scrollTop,770,'El centro visible queda fijo verticalmente');
 assert.equal(label.textContent,'200%');
 touch.zoomAt(50);
 assert.equal(svg.style.width,'350px');
 assert.equal(touch.zoom(),50);
 touch.zoomAt(800);
 assert.equal(touch.zoom(),600,'Zoom máximo controlado');
});
test('pellizcar: distancia doble amplía al 200% y desplaza el plano sin cambiar solares',()=>{
 const {touch,viewport,svg,target}=setup();
 touch.render();
 const touchstart=touch.events.get('touchstart'),touchmove=touch.events.get('touchmove'),touchend=touch.events.get('touchend');
 let blockedStart=false,blockedMove=false;
 touchstart({target,touches:[finger(100,100),finger(200,100)],cancelable:true,preventDefault(){blockedStart=true}});
 touchmove({target,touches:[finger(100,100),finger(300,100)],cancelable:true,preventDefault(){blockedMove=true}});
 assert.ok(blockedStart&&blockedMove);
 assert.equal(touch.zoom(),200);
 assert.equal(svg.style.width,'1400px');
 assert.equal(viewport.scrollLeft,500);
 assert.equal(viewport.scrollTop,600);
 let clickSuppressed=false;
 touch.events.get('click')({target,preventDefault(){clickSuppressed=true},stopImmediatePropagation(){}});
 assert.ok(clickSuppressed,'Pellizcar no debe abrir un solar');
 touchend({touches:[]});
});
test('deslizar con un dedo deja funcionar el scroll táctil nativo y no abre el solar',()=>{
 const {touch,target}=setup();
 touch.render();
 const start=touch.events.get('touchstart'),move=touch.events.get('touchmove'),end=touch.events.get('touchend');
 start({target,touches:[finger(100,100)]});
 let prevented=false;
 move({target,touches:[finger(160,150)],cancelable:true,preventDefault(){prevented=true}});
 assert.equal(prevented,false,'Scroll nativo de un dedo permitido');
 end({touches:[]});
 let blocked=false;
 touch.events.get('click')({target,preventDefault(){blocked=true},stopImmediatePropagation(){}});
 assert.equal(blocked,true);
});
test('el gesto de zoom también mantiene las teclas y ratón en el escritorio',()=>{
 const {touch,viewport,target}=setup({width:900,zoom:125});
 touch.render();
 assert.equal(touch.zoom(),125);
 let prevented=false;
 touch.events.get('wheel')({ctrlKey:true,target,deltaY:-80,clientX:300,clientY:200,cancelable:true,preventDefault(){prevented=true}});
 assert.equal(prevented,true);
 assert.ok(touch.zoom()>125&&touch.zoom()<=600);
 assert.equal(viewport.style.overscrollBehavior,'contain');
});

test('bloque seleccionado entra completo en una pantalla móvil y permite ampliar',()=>{
 const {touch,svg,viewport}=setup({fit:true,box:'0 0 100 200',yaw:-6});
 touch.render();
 const width=parseFloat(svg.style.width),height=width*2;
 const a=6*Math.PI/180;
 assert.ok(width*Math.cos(a)+height*Math.sin(a)<=viewport.clientWidth);
 assert.ok(width*Math.sin(a)+height*Math.cos(a)<=viewport.clientHeight);
 assert.ok(width<360);
 assert.ok(parseFloat(svg.style.marginTop)>=0);
 touch.zoomAt(200);
 assert.equal(parseFloat(svg.style.width),width*2);
});
