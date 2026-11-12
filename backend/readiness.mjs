import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { prepareLegacyMigration } from './migrate.mjs';
import { openStore } from './store.mjs';

export function reconcileBackup(data) {
  const plan = prepareLegacyMigration(data);
  const store = openStore(':memory:');
  try {
    const counts = store.importLegacy(plan);
    if (store.read('sales').length || store.read('lots').length) throw new Error('La conciliación dejó registros persistentes.');
    const total = (rows, field) => rows.reduce((sum, row) => sum + BigInt(row[field]), 0n);
    return {
      counts,
      centavos: {
        valor_ventas: total(plan.sales, 'price').toString(),
        abonos_historicos: total(plan.sales, 'opening').toString(),
        pagos: total(plan.payments, 'amount').toString(),
        saldo: total(plan.sales, 'balance').toString(),
      },
    };
  } finally {
    store.close();
  }
}

export async function verifyInstallation(origin, token) {
  const url = new URL(origin);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Indica únicamente el origen HTTPS del servidor o una URL HTTP de loopback.');
  }
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new Error('Falta una credencial de consulta válida.');
  async function load(path, expected, authenticate = false) {
    const response = await fetch(new URL(path, url), {
      headers: authenticate ? { Authorization: 'Bearer ' + token } : {},
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status !== expected) throw new Error(path + ' devolvió HTTP ' + response.status + ', se esperaba ' + expected + '.');
    return response;
  }
  const [panel, stylesheet, icon, script, denied, authenticated] = await Promise.all([
    load('/', 200), load('/approved-panel.css', 200), load('/lotigest-icon.webp', 200),
    load('/workspace.mjs', 200), load('/api/v1/catalog', 401), load('/api/v1/me', 200, true),
  ]);
  const [markup, css, iconBytes, module, error, actor] = await Promise.all([
    panel.text(), stylesheet.text(), icon.arrayBuffer(), script.text(), denied.json(), authenticated.json(),
  ]);
  if (!markup.includes('lotigest-sidebar') || !css.includes('.lotigest-sidebar') ||
      !icon.headers.get('content-type')?.startsWith('image/webp') || !iconBytes.byteLength ||
      !module.includes('/api/v1/') || typeof error.error !== 'string' || actor.role !== 'reader') {
    throw new Error('La instalación no cumple las comprobaciones de interfaz y acceso de consulta.');
  }
  const catalog = await (await load('/api/v1/catalog', 200, true)).json();
  const fields = ['lots', 'clients', 'reservations', 'sales'];
  if (!fields.every(field => Array.isArray(catalog[field]))) throw new Error('El catálogo central tiene un formato inesperado.');
  return { transporte: url.protocol.slice(0, -1), panel: 'ok', autenticacion: 'ok',
    registros: Object.fromEntries(fields.map(field => [field, catalog[field].length])) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [mode, target, ...extra] = process.argv.slice(2);
  try {
    if (!target || extra.length) throw new Error('Uso: node backend/readiness.mjs backup <archivo.json> | server <origen>');
    const report = mode === 'backup'
      ? reconcileBackup(JSON.parse(readFileSync(target, 'utf8').replace(/^\uFEFF/, '')))
      : mode === 'server'
        ? await verifyInstallation(target, process.env.LOTIGEST_READER_TOKEN)
        : undefined;
    if (!report) throw new Error('Modo inválido. Usa backup o server.');
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error('Validación de LOTIGEST: ' + error.message);
    process.exitCode = 1;
  }
}
