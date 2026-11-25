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
 assert.ok(ui.indexOf('removeOrphanOwnerLinks(db,')>ui.indexOf('async function save()'));
 assert.ok(ui.indexOf('removeOrphanOwnerLinks(db,')<ui.indexOf('const original=contractsPage'));
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

test('ficha de Terrenos y Predios ofrece quitar propietario del solar sin tocar otros',()=>{
 assert.match(ui,/function inlineSolarCleanup\(lotId\)/);
 assert.match(ui,/viewLot=function\(lotId\)/);
 assert.match(ui,/openSolarWindow=function\(lotId\)/);
 assert.match(ui,/data-owner-cleanup-single/);
 assert.match(ui,/Quitar persona de este solar/);
 assert.match(ui,/const candidate=audit.candidates.find/);
 assert.match(ui,/selected.add\(lotId\)/);
 assert.match(ui,/owner-cleanup-reason/);
 assert.match(ui,/ownerUnlinkHistory|removeOrphanOwnerLinks\(db,/);
});

test('selección masiva incluye candidatos fuera del filtro y de la residencial cuando se elige el ámbito global',()=>{
 assert.match(ui,/data-owner-cleanup-all/);
 assert.match(ui,/data-owner-cleanup-global/);
 assert.match(ui,/new Set\(d\.audit\.candidates\.map\(x=>x\.lotId\)\)/);
 assert.match(ui,/global\?null:residence\(\)\.id/);
 assert.match(ui,/d\.reason,undefined,true,true/);
});
