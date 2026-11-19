// Mapa de solares: pellizcar con dos dedos para acercar/alejar.
// Un dedo utiliza el desplazamiento nativo del contenedor; una pulsación sigue abriendo la ficha.
// No altera puntos, medidas, precios ni estados de los terrenos.
const solarTouchMinZoom=50,solarTouchMaxZoom=600;
const solarTouchClamp=n=>Math.max(solarTouchMinZoom,Math.min(solarTouchMaxZoom,n));
const solarTouchDistance=(a,b)=>Math.hypot(b.clientX-a.clientX,b.clientY-a.clientY);
const solarTouchMiddle=(a,b)=>({x:(a.clientX+b.clientX)/2,y:(a.clientY+b.clientY)/2});
let solarTouchSized=null,solarTouchBaseWidth=700,solarTouchGesture=null,solarTouchStart=null,solarTouchPreventClickUntil=0;

function solarTouchElements(){
 const viewport=document.getElementById('arrayan-scroll'),svg=document.getElementById('arrayan-native');
 return viewport&&svg&&viewport.contains(svg)?{viewport,svg}:null;
}
function solarTouchSync(){
 const found=solarTouchElements();
 if(!found){solarTouchSized=null;solarTouchGesture=null;return;}
 const {viewport,svg}=found;
 // La anchura mínima fija anterior (700 px) impedía alejar con los dedos en móviles.
 if(svg!==solarTouchSized||solarTouchBaseWidth!==Math.max(700,viewport.clientWidth||0)){
  solarTouchSized=svg;
  solarTouchBaseWidth=Math.max(700,viewport.clientWidth||0);
 }
 svg.style.minWidth='0px';
 svg.style.maxWidth='none';
 svg.style.width=Math.round(solarTouchBaseWidth*solarTouchClamp(arrayanZoom)/100)+'px';
 svg.style.height='auto';
 svg.style.touchAction='pan-x pan-y';
 viewport.style.overscrollBehavior='contain';
 const label=document.getElementById('arrayan-zoom-label');
 if(label)label.textContent=Math.round(arrayanZoom)+'%';
}
function solarTouchLocalPoint(clientX,clientY,viewport){
 const rect=viewport.getBoundingClientRect();
 return {x:clientX-rect.left-viewport.clientLeft,y:clientY-rect.top-viewport.clientTop};
}
function solarTouchZoomAt(nextZoom,clientX,clientY){
 solarTouchSync();
 const found=solarTouchElements();if(!found)return;
 const {viewport}=found;
 const center=clientX==null||clientY==null?
  {x:viewport.clientWidth/2,y:viewport.clientHeight/2}:
  solarTouchLocalPoint(clientX,clientY,viewport);
 const oldZoom=solarTouchClamp(arrayanZoom)/100;
 const mapX=(viewport.scrollLeft+center.x)/oldZoom;
 const mapY=(viewport.scrollTop+center.y)/oldZoom;
 const newZoom=solarTouchClamp(nextZoom);
 arrayanZoom=newZoom;
 solarTouchSync();
 viewport.scrollLeft=mapX*(newZoom/100)-center.x;
 viewport.scrollTop=mapY*(newZoom/100)-center.y;
}
function solarTouchStartPinch(event){
 const touches=event.touches;
 if(touches.length<2)return;
 const found=solarTouchElements();if(!found)return;
 solarTouchSync();
 const mid=solarTouchMiddle(touches[0],touches[1]),point=solarTouchLocalPoint(mid.x,mid.y,found.viewport);
 const scale=solarTouchClamp(arrayanZoom)/100;
 solarTouchGesture={
  zoom:solarTouchClamp(arrayanZoom),
  distance:Math.max(1,solarTouchDistance(touches[0],touches[1])),
  anchorX:(found.viewport.scrollLeft+point.x)/scale,
  anchorY:(found.viewport.scrollTop+point.y)/scale
 };
 solarTouchPreventClickUntil=Date.now()+450;
 if(event.cancelable)event.preventDefault();
}
function solarTouchOnStart(event){
 if(!event.target.closest?.('#arrayan-scroll'))return;
 solarTouchSync();
 if(event.touches.length>=2){solarTouchStartPinch(event);return;}
 if(event.touches.length===1){
  solarTouchGesture=null;
  solarTouchStart={x:event.touches[0].clientX,y:event.touches[0].clientY,moved:false};
 }
}
function solarTouchOnMove(event){
 const found=solarTouchElements();
 if(!found)return;
 if(event.touches.length>=2){
  if(!solarTouchGesture)solarTouchStartPinch(event);
  const gesture=solarTouchGesture;if(!gesture)return;
  const a=event.touches[0],b=event.touches[1],mid=solarTouchMiddle(a,b);
  const center=solarTouchLocalPoint(mid.x,mid.y,found.viewport);
  const zoom=solarTouchClamp(gesture.zoom*solarTouchDistance(a,b)/gesture.distance);
  arrayanZoom=zoom;
  solarTouchSync();
  found.viewport.scrollLeft=gesture.anchorX*(zoom/100)-center.x;
  found.viewport.scrollTop=gesture.anchorY*(zoom/100)-center.y;
  solarTouchPreventClickUntil=Date.now()+450;
  if(event.cancelable)event.preventDefault();
  return;
 }
 if(solarTouchGesture&&event.cancelable)event.preventDefault();
 if(solarTouchStart&&event.touches.length===1){
  const t=event.touches[0];
  if(Math.hypot(t.clientX-solarTouchStart.x,t.clientY-solarTouchStart.y)>12)solarTouchStart.moved=true;
 }
}
function solarTouchOnEnd(event){
 if(solarTouchGesture){
  solarTouchPreventClickUntil=Date.now()+450;
  if(event.touches.length<2)solarTouchGesture=null;
 } else if(solarTouchStart?.moved){
  solarTouchPreventClickUntil=Date.now()+250;
 }
 if(!event.touches.length)solarTouchStart=null;
}
document.addEventListener('touchstart',solarTouchOnStart,{capture:true,passive:false});
document.addEventListener('touchmove',solarTouchOnMove,{capture:true,passive:false});
document.addEventListener('touchend',solarTouchOnEnd,{capture:true,passive:true});
document.addEventListener('touchcancel',solarTouchOnEnd,{capture:true,passive:true});
document.addEventListener('click',event=>{
 if(Date.now()>=solarTouchPreventClickUntil)return;
 if(!event.target.closest?.('#arrayan-scroll'))return;
 event.preventDefault();event.stopImmediatePropagation();
},true);
// Gestos del panel táctil de una computadora: Ctrl + rueda, conservando el punto focal.
document.addEventListener('wheel',event=>{
 if(!(event.ctrlKey||event.metaKey)||!event.target.closest?.('#arrayan-scroll'))return;
 if(event.cancelable)event.preventDefault();
 solarTouchZoomAt(solarTouchClamp(arrayanZoom*Math.exp(-event.deltaY*.005)),event.clientX,event.clientY);
},{capture:true,passive:false});
// Conservar los botones +/- y centrar el zoom sobre la zona visible.
arrayanSetZoom=function(n){solarTouchZoomAt(n);};
// El mapa se reconstruye al aplicar filtros o abrir un solar: recuperar su anchura táctil.
const solarTouchPreviousRender=render;
render=function(...args){
 const output=solarTouchPreviousRender(...args);
 if(document.getElementById('arrayan-scroll'))solarTouchSync();
 return output;
};
