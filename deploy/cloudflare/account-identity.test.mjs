import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./ledger-ui.js',import.meta.url),'utf8');const code=source.slice(source.indexOf('function cloudRenderAccountIdentity(){'),source.indexOf('function render ()'));
for(const [name,role,label]of [['qa_vendedor','sales','Vendedor'],['qa_admin','admin','Administrador']])test('barra identifica '+name+' sin confundir su perfil',()=>{
 const dom=new JSDOM('<button class="lg-user-button"><span class="lg-avatar">A</span><span class="lg-username">Administrador<small>GRUPO H</small></span></button><div id="lgUserPopup"><strong>Administrador</strong></div>');
 new Function('cloudUser','document',code+';cloudRenderAccountIdentity();')({name,role},dom.window.document);
 const button=dom.window.document.querySelector('button');assert.equal(button.getAttribute('aria-label'),name+' · '+label+' · Menú de usuario');assert.equal(button.querySelector('.lg-username').textContent,name+label);assert.equal(dom.window.document.querySelector('#lgUserPopup>strong').textContent,name+' · '+label);dom.window.close();
});
