import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('./solar-3d-map-ui.js',import.meta.url),'utf8');
function boot(){
 const dom=new JSDOM('<html><head></head><body><div id="arrayan-scroll"><svg id="arrayan-native">'+['available','sold','debt','reserved','private','contracted','prima-paid'].map((s,i)=>'<g class="ar-solar" data-action="arrayan-select" data-id="'+s+'"><polygon points="'+(i*20)+',0 '+(i*20+12)+',0 '+(i*20+12)+',15 '+(i*20)+',15" fill="#f4cd71"/><text x="'+(i*20+6)+'" y="8">'+i+'</text></g>').join('')+'</svg></div></body></html>',{url:'https://lotigest.example',runScripts:'outside-only'});
 const w=dom.window;
 w.eval("var page='arrayan',rid='arrayan';function residence(){return {id:rid}}function residenceFeatures(){return ['available','sold','debt','reserved','private','contracted','prima-paid'].map(key=>({key}));}function arrayanRecord(f){return {status:f.key}}function arrayanPage(){return '<div class=\"page-cols\"><div id=\"arrayan-scroll\"></div></div>';}function render(){return true;}");
 w.eval(source);w.render();return {dom,w,d:w.document};
}
const click=(app,mode)=>{const el=app.d.createElement('button');el.dataset.lgMapView=mode;app.d.body.append(el);el.click();};
test('vista del proyecto integrada; modo interactivo preserva polígonos, clics y techos por estado',()=>{
 const app=boot();try{
  assert.match(app.w.arrayanPage(),/altos-arrayan-vista-proyecto.webp/);
  assert.match(app.w.arrayanPage(),/colores y alturas de referencia/);
  assert.match(app.w.arrayanPage(),/14.4279541, -88.9510169/);
  assert.ok(app.d.querySelector('#arrayan-scroll').classList.contains('lg-project-mode'));
  const points=[...app.d.querySelectorAll('.ar-solar>polygon:not(.lg-solar-depth)')].map(el=>el.getAttribute('points'));
  const states={available:'#efc94c',sold:'#268d54',debt:'#d7474b',reserved:'#9660c5',private:'#9aa6aa',contracted:'#a3e635','prima-paid':'#16a34a'};
  for(const [key,color] of Object.entries(states))assert.equal(app.d.querySelector('[data-id="'+key+'"] [data-roof]').getAttribute('fill'),color);
  click(app,'3d');assert.ok(app.d.querySelector('#arrayan-scroll').classList.contains('lg-3d-mode'));
  assert.equal(app.d.querySelectorAll('.lg-map-house').length,7);
  app.w.render();assert.equal(app.d.querySelectorAll('.lg-map-house').length,7);assert.equal(app.d.querySelectorAll('.lg-map-terraces').length,1);
  click(app,'2d');assert.ok(!app.d.querySelector('#arrayan-scroll').classList.contains('lg-3d-mode'));
  assert.deepEqual([...app.d.querySelectorAll('.ar-solar>polygon:not(.lg-solar-depth)')].map(el=>el.getAttribute('points')),points);
  assert.equal(app.d.querySelectorAll('.ar-solar[data-action="arrayan-select"]').length,7);
 }finally{app.dom.window.close();}
});
test('giro completo, persistencia de modo y otras residenciales sin imagen de Arrayán',()=>{
 const app=boot();try{
  click(app,'3d');const btn=app.d.createElement('button');btn.dataset.lgMapTurn='1';app.d.body.append(btn);for(let i=0;i<8;i++)btn.click();assert.equal(app.d.querySelector('#arrayan-scroll').style.getPropertyValue('--lg-map-yaw'),'354deg');
  assert.equal(app.w.localStorage.getItem('lotigest-map-mode-3d-v2'),'3d');
  app.w.eval("rid='otra'");assert.doesNotMatch(app.w.arrayanPage(),/altos-arrayan-vista-proyecto.webp/);
 }finally{app.dom.window.close();}
});
