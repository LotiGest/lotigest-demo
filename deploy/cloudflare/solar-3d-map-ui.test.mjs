import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const source=readFileSync(new URL('./solar-3d-map-ui.js',import.meta.url),'utf8');
test('La vista 3D mantiene los puntos originales, clics y modo 2D',()=>{
 const dom=new JSDOM('<!doctype html><html><head></head><body><div id="arrayan-scroll"><svg id="arrayan-native"><g class="ar-solar" data-action="arrayan-select" data-id="ar-001"><polygon points="1,2 11,2 11,12 1,12" fill="#5dc39a"/><text>1</text></g></svg></div></body></html>',{url:'https://lotigest.example',runScripts:'outside-only'});
 const w=dom.window;
 w.eval("var page='arrayan';function arrayanPage(){return '<div class=\"page-cols\"><div id=\"arrayan-scroll\"></div></div>';}function render(){return true;}");
 w.localStorage.setItem('lotigest-map-mode-3d-v2','3d');
 w.eval(source);
 assert.match(w.arrayanPage(),/data-lg-map-view="3d"/);
 assert.equal(w.render(),true);
 const svg=w.document.querySelector('#arrayan-native');
 const group=svg.querySelector('[data-action="arrayan-select"]');
 assert.equal(group.dataset.id,'ar-001');
 assert.equal(group.querySelector('polygon:not(.lg-solar-depth)').getAttribute('points'),'1,2 11,2 11,12 1,12');
 assert.equal(group.querySelectorAll('.lg-solar-depth').length,2);
 assert.equal(group.querySelectorAll('text').length,1);
 assert.ok(w.document.querySelector('#arrayan-scroll').classList.contains('lg-3d-mode'));
 const two=w.document.createElement('button');two.setAttribute('data-lg-map-view','2d');w.document.body.appendChild(two);
 two.click();assert.ok(!w.document.querySelector('#arrayan-scroll').classList.contains('lg-3d-mode'));
 assert.equal(group.querySelector('polygon:not(.lg-solar-depth)').getAttribute('points'),'1,2 11,2 11,12 1,12');
 dom.window.close();
});

test('Vista de etapa/bloque conserva geometría, vegetación y recupera mapa completo',()=>{
 const dom=new JSDOM('<!doctype html><html><head></head><body><main id="map"></main></body></html>',{url:'https://lotigest.example',runScripts:'outside-only'});
 const w=dom.window;
 w.eval(`
  var arrayanStageFilter='all',arrayanBlockFilter='all',arrayanKindFilter='all',arrayanFilter='all',arrayanZoom=100,arrayanSelected=null;
  const features=[
    {key:'a1',stage:1,block:'A',points:[[10,10],[20,10],[20,20],[10,20]]},
    {key:'b1',stage:1,block:'B',points:[[40,40],[50,40],[50,50],[40,50]]},
    {key:'a2',stage:2,block:'A',points:[[70,70],[80,70],[80,80],[70,80]]}
  ];
  function residence(){return {id:'arrayan'};}
  function mapFeatures(){return features;}
  function residenceRecords(){return {};}
  function residenceFeatures(){return features;}
  function arrayanRecord(){return {status:'available'};}
  function arrayanPage(){
   return '<div class="page-cols"><div id="arrayan-scroll"><svg id="arrayan-native" viewBox="0 0 100 100"><g id="original-tree"><circle cx="12" cy="13" r="1"/></g>'+
   features.map(f=>'<g class="ar-solar" data-id="'+f.key+'"><polygon points="'+f.points.map(p=>p.join(',')).join(' ')+'" fill="#abcdef"/><text x="'+f.points[0][0]+'" y="'+f.points[0][1]+'">1</text></g>').join('')+'</svg></div></div>';
  }
  function render(){document.getElementById('map').innerHTML=arrayanPage();}
 `);
 w.localStorage.setItem('lotigest-map-mode-3d-v2','project');
 w.eval(source);w.render();
 const d=w.document;
 const choose=(id,value)=>{const el=d.getElementById(id);el.value=value;el.dispatchEvent(new w.Event('change',{bubbles:true}));};
 const visible=()=>[...d.querySelectorAll('.ar-solar:not(.lg-outside-scope)')].map(x=>x.dataset.id);
 assert.deepEqual(visible(),['a1','b1','a2']);
 assert.equal(d.querySelector('#arrayan-native').getAttribute('viewBox'),'0 0 100 100');
 choose('lg-map-stage','1');
 assert.deepEqual(visible(),['a1','b1']);
 assert.ok(d.querySelector('#arrayan-scroll').classList.contains('lg-3d-mode'));
 choose('lg-map-block','A');
 assert.deepEqual(visible(),['a1']);
 assert.notEqual(d.querySelector('#arrayan-native').getAttribute('viewBox'),'0 0 100 100');
 assert.equal(d.querySelector('[data-id="a1"] polygon:not(.lg-solar-depth)').getAttribute('points'),'10,10 20,10 20,20 10,20');
 assert.ok(d.querySelector('#original-tree'));
 assert.ok(d.querySelector('[data-id="a1"] .lg-map-tree'));
 d.querySelector('[data-lg-map-full]').click();
 assert.deepEqual(visible(),['a1','b1','a2']);
 assert.equal(d.querySelector('#arrayan-native').getAttribute('viewBox'),'0 0 100 100');
 assert.equal(d.getElementById('lg-map-stage').value,'');
 assert.equal(d.getElementById('lg-map-block').value,'');
 assert.equal(d.querySelector('[data-id="a2"] polygon:not(.lg-solar-depth)').getAttribute('points'),'70,70 80,70 80,80 70,80');
 dom.window.close();
});
