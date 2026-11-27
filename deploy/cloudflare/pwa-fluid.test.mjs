import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./pwa-fluid-ui.js',import.meta.url),'utf8');
function boot(installed=false){
 const dom=new JSDOM('<main></main>',{url:'https://lotigest.test',runScripts:'outside-only'}),w=dom.window;
 w.matchMedia=()=>({matches:installed,addEventListener(){}});w.toast=message=>w.lastToast=message;
 w.eval("function settingsPage(){return '<form><input name=company value=PRUEBA></form>'}");
 w.cloudWrite=()=>{throw Error('must not write business data');};w.fetch=()=>{throw Error('must not send data');};w.eval(source);
 w.document.querySelector('main').innerHTML=w.settingsPage();return {dom,w,d:w.document};
}
test('fluid mode is enabled locally, can be switched without rerendering or losing entered data',()=>{
 const {dom,w,d}=boot();try{
  const input=d.querySelector('[name=company]');input.value='DATOS SIN GUARDAR';assert.ok(d.documentElement.classList.contains('lg-fluid-mode'));
  d.querySelector('[data-lg-fluid-toggle]').click();assert.equal(w.localStorage.getItem('lotigest-fluid-mode-v1'),'off');assert.equal(d.querySelector('[data-lg-fluid-toggle]').getAttribute('aria-pressed'),'false');assert.equal(input.value,'DATOS SIN GUARDAR');
  d.querySelector('[data-lg-fluid-toggle]').click();assert.ok(d.documentElement.classList.contains('lg-fluid-mode'));assert.equal(input.value,'DATOS SIN GUARDAR');
 }finally{dom.window.close();}
});
test('installation is requested only by a user click, installed status follows the browser and fallback gives instructions',async()=>{
 const {dom,w,d}=boot();try{
  d.querySelector('[data-lg-install-app]').click();assert.match(w.lastToast,/Chrome/);
  let calls=0;const event=new w.Event('beforeinstallprompt',{cancelable:true});event.prompt=async()=>calls++;event.userChoice=Promise.resolve({outcome:'accepted'});w.dispatchEvent(event);
  assert.equal(calls,0);assert.equal(event.defaultPrevented,true);d.querySelector('[data-lg-install-app]').click();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(calls,1);
  w.dispatchEvent(new w.Event('appinstalled'));assert.equal(d.querySelector('[data-lg-install-app]').disabled,true);
 }finally{dom.window.close();}
 const installed=boot(true);try{assert.equal(installed.d.querySelector('[data-lg-install-app]').disabled,true);}finally{installed.dom.window.close();}
});
test('built manifest has real installable PNG sizes, standalone identity and offline cached icons',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../../cloudflare-pages/manifest.webmanifest',import.meta.url),'utf8'));
 assert.equal(manifest.id,'/');assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'/');
 for(const size of [192,512]){const icon=manifest.icons.find(i=>i.sizes===`${size}x${size}`);assert.ok(icon);const png=readFileSync(new URL('../../cloudflare-pages'+icon.src,import.meta.url));assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);}
 const html=readFileSync(new URL('../../cloudflare-pages/index.html',import.meta.url),'utf8');assert.match(html,/lotigest-pwa-fluid/);assert.match(html,/data-lg-install-app/);
});
