import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const source=readFileSync(new URL('./solar-3d-map-ui.js',import.meta.url),'utf8');
test('La vista 3D mantiene los puntos originales, clics y modo 2D',()=>{
 const dom=new JSDOM('<!doctype html><html><head></head><body><div id="arrayan-scroll"><svg id="arrayan-native"><g class="ar-solar" data-action="arrayan-select" data-id="ar-001"><polygon points="1,2 11,2 11,12 1,12" fill="#5dc39a"/><text>1</text></g></svg></div></body></html>',{url:'https://lotigest.example',runScripts:'outside-only'});
 const w=dom.window;
 w.eval("var page='arrayan';function arrayanPage(){return '<div class=\"page-cols\"><div id=\"arrayan-scroll\"></div></div>';}function render(){return true;}");
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
