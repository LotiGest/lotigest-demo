import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('./control-panels.css',import.meta.url),'utf8');
test('historical payment labels, reconciliation and methods pair dark text surfaces and retain light-theme readability',()=>{
 const dom=new JSDOM('<style>'+css+'</style><body class="lotigest-dark cp-inline-payment"><div id="modal-root"><section class="lg-payment-modern"><div class="pm-historical-lots"><h4>Solares</h4><p>Seleccionar solares</p><label><input type="checkbox" checked><span>Etapa 2 · N · 12</span></label></div><div class="pm-reconcile-scroll"><table class="pm-reconcile-table"><thead><tr><th>Fecha</th></tr></thead><tbody><tr><td><small>Sin movimientos</small></td></tr></tbody></table></div><div class="pm-method-buttons"><button aria-pressed="false">Prima</button><button aria-pressed="true">Abono</button></div></section></div></body>');
 try{
  const {document:d}=dom.window;
  // jsdom does not apply screen media rules; inspect only the theme rules with
  // the same selector engine, separately from viewport assertions.
  d.querySelector('style').textContent=css.slice(css.indexOf('/* Historical payments')).replace('@media screen{','').split('@media screen and')[0].replace(/}\s*$/,'');
  const style=s=>dom.window.getComputedStyle(d.querySelector(s));
  for(const s of ['.pm-historical-lots h4','.pm-historical-lots p','.pm-historical-lots span','.pm-reconcile-table td','.pm-reconcile-table small','.pm-method-buttons button'])assert.equal(style(s).color,'rgb(241, 247, 244)',s);
  assert.equal(style('.pm-historical-lots').backgroundColor,'rgb(17, 43, 35)');
  assert.equal(style('[aria-pressed=true]').backgroundColor,'rgb(8, 125, 54)');
  d.body.classList.remove('lotigest-dark');
  for(const s of ['.pm-historical-lots h4','.pm-historical-lots p','.pm-historical-lots span','.pm-reconcile-table td'])assert.equal(style(s).color,'rgb(24, 55, 43)',s);
  assert.match(css,/workspace>#modal-root:has\(\.lg-payment-modern\)\{padding-bottom:125px!important/);
 }finally{dom.window.close();}
});
