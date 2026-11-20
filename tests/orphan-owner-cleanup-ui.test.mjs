import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('../deploy/cloudflare/orphan-owner-cleanup-ui.js',import.meta.url),'utf8');
const moduleText=readFileSync(new URL('../deploy/cloudflare/contract-owner-assign-ui.js',import.meta.url),'utf8');
const build=readFileSync(new URL('../deploy/cloudflare/build.mjs',import.meta.url),'utf8');
test('no hay limpieza automática al abrir el panel',()=>{
 assert.match(ui,/data-owner-cleanup-open/);
 assert.match(ui,/data-owner-cleanup-save/);
 assert.match(ui,/new Set\(\)/);
 assert.doesNotMatch(ui,/removeOrphanOwnerLinks\(db,[^)]*\)\s*;/);
});
test('solo admin sincronizado puede eliminar con respaldo y confirmación',()=>{
 assert.match(ui,/contractIntakeAdmin\(\)/);
 assert.match(ui,/backupDownloaded/);
 assert.match(ui,/confirmedBackup/);
 assert.match(ui,/d\.code!=='DESVINCULAR'/);
 assert.match(ui,/data-owner-cleanup-backup/);
 assert.match(ui,/cloudWrite\(JSON\.stringify\(result\.state\)\)/);
 assert.match(ui,/await cloudFlush\(\)/);
});
test('Contratos diferencia solares respaldados y provisionales',()=>{
 assert.match(moduleText,/contractOwnerHasConfirmedContract/);
 assert.match(moduleText,/En contrato/);
 assert.match(moduleText,/Provisional, sin contrato/);
 assert.match(build,/owner-link-cleanup\.mjs/);
 assert.match(build,/orphan-owner-cleanup-ui\.js/);
});
