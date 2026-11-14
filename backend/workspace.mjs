import { documentFields, extractDocumentFields } from '/document-fields.mjs';
import { offlineRoutes, openOperationQueue, synchronizeQueue } from '/offline-queue.mjs';
import { mapClientRows } from '/client-import.mjs';
import { buyerCsvRows, readExcelRows } from '/spreadsheet-reader.mjs';

const $ = id => document.getElementById(id);
const roles = { admin: 'Administración', sales: 'Ventas', cashier: 'Caja', reader: 'Consulta' };
const labels = { available: 'Disponible', reserved: 'Apartado', sold: 'Vendido', active: 'Activo',
  converted: 'Convertido', cancelled: 'Cancelado', expired: 'Vencido', pending: 'Pendiente', late: 'Vencida', paid: 'Pagada' };
const currency = new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = cents => 'L. ' + currency.format(cents / 100);
const today = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Tegucigalpa', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return parts.year + '-' + parts.month + '-' + parts.day;
};

let queue;
function operationQueue() { return queue ??= openOperationQueue(); }
let actor, catalog, pending, activeModule = 'overview';
const navigation = Array.from(document.querySelectorAll('[data-module]'));
function showModule(name, { focus = true } = {}) {
  if (actor && !canUse(name, true)) { status('Tu usuario no tiene acceso a este panel.'); return; }
  activeModule = name;
  for (const item of navigation) {
    const active = item.dataset.module === name;
    item.classList.toggle('active', active);
    if (active) {
      item.setAttribute('aria-current', 'page');
      $('module-title').textContent = item.querySelector('em').textContent;
    } else item.removeAttribute('aria-current');
  }
  for (const item of document.querySelectorAll('[data-panel]')) item.hidden = !item.dataset.panel.split(' ').includes(name);
  $('detail').hidden = true;
  setMenu(false);
  if (focus) {
    $('module-title').tabIndex = -1;
    $('module-title').focus();
  }
}
function setMenu(open) {
  $('central-sidebar').classList.toggle('open', open);
  $('menu').setAttribute('aria-expanded', String(open));
}
function panelPreference(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch { /* La apariencia sigue disponible cuando se bloquea el almacenamiento. */ }
}
function setTheme(dark) {
  document.body.classList.toggle('lotigest-dark', dark);
  $('theme').setAttribute('aria-pressed', String(dark));
  $('theme').textContent = dark ? '☀' : '◐';
}
function setPin(pinned) {
  $('central-sidebar').classList.toggle('pinned', pinned);
  $('pin').setAttribute('aria-pressed', String(pinned));
  $('pin').textContent = pinned ? '◆' : '♧';
}
setTheme(panelPreference('lotigest-v08-theme') === 'dark');
setPin(panelPreference('lotigest-v08-pin') === 'true');
$('theme').onclick = () => {
  const dark = !document.body.classList.contains('lotigest-dark');
  setTheme(dark);
  panelPreference('lotigest-v08-theme', dark ? 'dark' : 'light');
};
$('pin').onclick = () => {
  const pinned = !$('central-sidebar').classList.contains('pinned');
  setPin(pinned);
  panelPreference('lotigest-v08-pin', String(pinned));
};
$('menu').onclick = () => setMenu($('menu').getAttribute('aria-expanded') !== 'true');
for (const item of navigation) item.onclick = () => {
  showModule(item.dataset.module);
  if (item.dataset.module === 'documents') run(null, loadDocuments);
  if (item.dataset.module === 'settings') run(null, loadSettings);
};
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && $('menu').getAttribute('aria-expanded') === 'true') {
    setMenu(false);
    $('menu').focus();
  }
});
function element(tag, content) {
  const node = document.createElement(tag);
  if (content != null) node.textContent = content;
  return node;
}
function button(label, action) {
  const node = element('button', label);
  node.type = 'button';
  node.className = 'btn btn-soft';
  node.onclick = event => run(event.currentTarget, action);
  return node;
}
function status(message = '') { $('status').textContent = message; }
function canUse(panel, legacy = true) {
  return actor?.role === 'admin' || (actor?.panels ? actor.panels.includes(panel) : legacy);
}
function showUser(user) {
  actor = user;
  $('login').hidden = !!user;
  $('workspace').hidden = !user;
  showModule('overview', { focus: false });
  if (user) {
    for (const item of navigation) {
      const panel = item.dataset.module;
      item.hidden = panel === 'settings' ? user.role !== 'admin' :
        !canUse(panel, panel !== 'documents' || user.role === 'sales');
    }
    const initial = navigation.find(item => !item.hidden);
    if (initial) showModule(initial.dataset.module, { focus: false });
    else {
      activeModule = '';
      for (const item of document.querySelectorAll('[data-panel]')) item.hidden = true;
      status('Tu usuario todavía no tiene paneles asignados.');
    }
    $('actor').textContent = user.name + ' · ' + (user.panels ? 'Normal' : roles[user.role]);
    try {
      const saved = JSON.parse(sessionStorage.getItem(pendingKey()));
      pending = saved && typeof saved.key === 'string' && typeof saved.fingerprint === 'string' ? saved : undefined;
    } catch { pending = undefined; }
  }
  else {
    catalog = pending = undefined;
    for (const id of ['summary', 'forms', 'lots', 'clients', 'reservations', 'sales', 'documents', 'detail']) $(id).replaceChildren();
    $('detail').hidden = true;
    $('offline-status').replaceChildren();
    $('offline-status').hidden = true;
  }
}
async function api(path, data, key, owner) {
  const options = data === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key && { 'Idempotency-Key': key }), ...(owner && { 'Lotigest-Operation-Owner': owner }) },
    body: JSON.stringify(data),
  };
  const response = await fetch('/api/v1/' + path, { ...options, signal: AbortSignal.timeout(12000) });
  const body = await response.json();
  if (!response.ok) throw Object.assign(new Error(body.error), { status: response.status });
  return body;
}
let busy = false;
async function run(control, action) {
  if (busy) return;
  busy = true;
  if (control) control.disabled = true;
  status();
  try {
    await action();
  } catch (error) {
    if (error.status === 401 && actor) showUser(null);
    status(error.message || 'No se pudo conectar con LOTIGEST.');
  } finally {
    busy = false;
    if (control) control.disabled = false;
  }
}
function pendingKey() { return 'lotigest-pending-v1-' + actor.name; }
function savePending(value) {
  pending = value;
  try {
    if (value) sessionStorage.setItem(pendingKey(), JSON.stringify(value));
    else sessionStorage.removeItem(pendingKey());
  } catch { /* Mantener la clave en memoria si el navegador bloquea el almacenamiento. */ }
}
const operationNames = { reservations: 'Apartado', 'cancel-reservation': 'Cancelar apartado', sales: 'Venta',
  payments: 'Pago', 'payment-batches': 'Cobro agrupado' };
async function renderQueue() {
  const box = $('offline-status');
  if (!actor) return;
  const items = await operationQueue().list(actor.name);
  box.replaceChildren();
  box.hidden = !items.length && navigator.onLine;
  if (box.hidden) return;
  box.append(element('strong', navigator.onLine ? 'Operaciones pendientes de sincronizar' : 'Sin conexión'));
  if (!navigator.onLine) box.append(element('p', 'Puedes consultar los datos cargados y guardar movimientos pendientes. Conserva esta sesión abierta.'));
  if (!items.length) return;
  box.append(element('p', items.length + ' operaciones pendientes. Los saldos y estados cambian cuando el servidor confirme.'));
  const list = element('ul');
  for (const item of items) {
    const label = operationNames[item.route] + ' · ' + (item.data.lot_id || item.data.sale_id || item.data.id || item.data.entries.length + ' ventas');
    const line = element('li', label + (item.conflict ? ' · ' + item.conflict : ' · Pendiente'));
    if (item.conflict) {
      line.append(button('Descartar operación rechazada', async () => {
        if (!confirm('¿Quitar esta operación rechazada de la cola?')) return;
        await operationQueue().remove(item.sequence);
        await synchronize();
      }));
    }
    list.append(line);
  }
  box.append(list, button('Sincronizar', async () => { await synchronize(); }));
}
async function synchronize() {
  if (!actor) return [];
  if (!navigator.onLine) {
    await renderQueue();
    return [];
  }
  const owner = actor.name;
  const drain = () => synchronizeQueue(operationQueue(), owner, item => api(item.route, item.data, item.key, owner));
  const result = navigator.locks ? await navigator.locks.request('lotigest-sync-' + owner, drain) : await drain();
  if (result.confirmed.some(item => item.key === pending?.key)) savePending(undefined);
  if (result.confirmed.length) {
    try { await refresh(); } catch { /* El servidor ya confirmó los movimientos. */ }
    status(result.confirmed.length + ' operaciones confirmadas por el servidor.');
  }
  await renderQueue();
  if (result.sessionRequired) {
    showUser(null);
    status('La cola sigue guardada. Inicia sesión con el mismo usuario para sincronizar.');
  } else if (result.waiting) status('Las operaciones siguen guardadas en este equipo. Se reintentarán cuando el servidor esté disponible.');
  return result.confirmed;
}

async function mutate(route, data) {
  const request = new TextEncoder().encode(JSON.stringify([route, data]));
  const bytes = await crypto.subtle.digest('SHA-256', request);
  const fingerprint = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
  if (offlineRoutes.has(route)) {
    const items = await operationQueue().list(actor.name);
    let item = items.find(candidate => candidate.fingerprint === fingerprint);
    if (!item) {
      if (pending && pending.fingerprint !== fingerprint) throw new Error('Actualiza el estado de la operación anterior antes de continuar.');
      item = await operationQueue().add({ owner: actor.name, route, data, fingerprint, key: pending?.key ?? crypto.randomUUID() });
    }
    const results = await synchronize();
    return results.find(entry => entry.key === item.key)?.result;
  }
  if (!navigator.onLine) throw new Error('Esta función requiere conexión. Conéctate para continuar.');
  if (pending && pending.fingerprint !== fingerprint) {
    throw new Error('Hay una operación sin confirmar. Reintenta con los mismos datos antes de iniciar otra.');
  }
  if (!pending) savePending({ fingerprint, key: crypto.randomUUID() });
  let result;
  try {
    result = await api(route, data, pending.key);
  } catch (error) {
    if (error.status >= 400 && error.status < 500 && error.status !== 401) savePending(undefined);
    else throw new Error('El servidor no confirmó la operación. Reintenta con los mismos datos.');
    throw error;
  }
  savePending(undefined);
  try {
    await refresh();
    status('Operación guardada.');
  } catch {
    status('Operación guardada. Pulsa Actualizar para consultar el estado.');
  }
  return result;
}
function table(target, headings, rows) {
  target.replaceChildren();
  if (!rows.length) {
    target.append(element('p', 'Sin registros.'));
    return;
  }
  const scroll = element('div');
  scroll.className = 'table-scroll';
  const grid = element('table');
  const heading = grid.createTHead().insertRow();
  for (const title of headings) {
    const column = element('th', title);
    column.scope = 'col';
    heading.append(column);
  }
  const body = grid.createTBody();
  for (const row of rows) {
    const tr = body.insertRow();
    for (const value of row) {
      const cell = tr.insertCell();
      if (value instanceof Node) cell.append(value);
      else cell.textContent = value ?? '';
    }
  }
  scroll.append(grid);
  target.append(scroll);
}
function input(name, type = 'text', value = '', attrs = {}) {
  return Object.assign(element('input'), { name, type, value, required: true, ...attrs });
}
function select(name, choices, optional = false) {
  const node = Object.assign(element('select'), { name, required: !optional });
  node.append(new Option(optional ? 'Sin apartado' : 'Selecciona…', ''));
  for (const [value, label] of choices) node.append(new Option(label, value));
  return node;
}
function operation(title, route, fields, encode) {
  const form = element('form');
  form.className = 'card';
  form.dataset.operation = route;
  form.dataset.panel = { lots: 'inventory', clients: 'clients', reservations: 'pending', sales: 'sales' }[route];
  form.hidden = form.dataset.panel !== activeModule;
  form.append(element('h2', title));
  for (const [label, field] of fields) {
    const node = element('label', label);
    node.append(field);
    form.append(node);
  }
  const submit = element('button', 'Guardar');
  submit.className = 'btn btn-primary';
  form.append(submit);
  form.onsubmit = event => {
    event.preventDefault();
    return run(submit, () => mutate(route, encode(Object.fromEntries(new FormData(form)))));
  };
  $('forms').append(form);
  return form;
}
const cents = value => Math.round(Number(value) * 100);
function renderClientImport() {
  const form = element('form');
  form.className = 'card';
  form.dataset.panel = 'clients';
  form.hidden = activeModule !== 'clients';
  const picker = input('spreadsheet', 'file', '', { accept: '.xlsx,.csv' });
  const label = element('label', 'Archivo Excel o CSV');
  label.append(picker);
  const sheet = select('sheet', []);
  sheet.hidden = true;
  sheet.required = false;
  sheet.setAttribute('aria-label', 'Hoja de Excel');
  const preview = element('div');
  const commit = element('button', 'Confirmar importación');
  commit.className = 'btn btn-primary';
  commit.disabled = true;
  const template = element('a', 'Descargar plantilla CSV');
  template.href = 'data:text/csv;charset=utf-8,%EF%BB%BFCodigo%3BNombre%3BIdentidad%3BTelefono%3BCorreo%3BDireccion%0D%0A';
  template.download = 'LOTIGEST-clientes.csv';
  let sheets = [], mapped, version = 0;
  function showPreview() {
    preview.replaceChildren();
    mapped = undefined;
    commit.disabled = true;
    if (!sheets.length) return;
    try {
      mapped = mapClientRows(sheets[Number(sheet.value)].rows, catalog.clients);
      const grid = element('div');
      table(grid, ['Código', 'Nombre', 'Identidad', 'Teléfono', 'Correo', 'Dirección'], mapped.clients.map(row =>
        [row.id, row.name, row.identity, row.phone, row.email, row.address]));
      preview.append(element('p', mapped.clients.length + ' clientes nuevos.'), grid);
      if (mapped.ignored.length) preview.append(element('p', 'Columnas que no se importarán: ' + mapped.ignored.join(', ')));
      commit.disabled = false;
    } catch (error) { preview.textContent = error.message; }
  }
  picker.onchange = async () => {
    const current = ++version;
    sheets = [];
    sheet.hidden = true;
    showPreview();
    const file = picker.files[0];
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('El archivo supera los 5 MiB.');
      let parsed;
      if (/\.xlsx$/i.test(file.name)) parsed = await readExcelRows(file);
      else if (/\.csv$/i.test(file.name)) parsed = [{ sheet: 'CSV', rows: buyerCsvRows(await file.text()) }];
      else throw new Error('Selecciona un archivo .xlsx o CSV UTF-8.');
      if (current !== version) return;
      if (!parsed.length) throw new Error('El archivo no contiene hojas con datos.');
      sheets = parsed;
      sheet.replaceChildren(...sheets.map((item, index) => new Option(item.sheet, String(index))));
      sheet.hidden = sheets.length < 2;
      showPreview();
    } catch (error) { if (current === version) preview.textContent = error.message; }
  };
  sheet.onchange = showPreview;
  form.onsubmit = event => {
    event.preventDefault();
    if (!mapped) return;
    const data = { rows: mapped.clients };
    return run(commit, () => mutate('client-import', data));
  };
  form.append(element('h2', 'Importar clientes'), template, label, sheet, preview, commit);
  $('forms').append(form);
}

function renderForms() {
  $('forms').replaceChildren();
  const { role } = actor;
  const clients = catalog.clients.map(client => [client.id, client.name]);
  const lots = catalog.lots.filter(lot => ['available', 'reserved'].includes(lot.status));
  const available = lots.filter(lot => lot.status === 'available').map(lot => [lot.id, lot.id]);
  const active = catalog.reservations.filter(res => res.status === 'active' && res.reserved_until >= today());
  if (canUse('inventory', false)) operation('Registrar solar', 'lots', [
    ['Código', input('id', 'text', '', { maxLength: 100 })],
    ['Precio en lempiras', input('price', 'number', '', { step: '.01', min: '.01' })],
  ], data => ({ id: data.id.trim().toUpperCase(), price_cents: cents(data.price) }));
  if (canUse('documents', role === 'sales')) renderDocumentScanner();
  if (role === 'admin') renderUserSettings();
  if (canUse('clients', role === 'sales')) {
    renderClientImport();
    operation('Registrar cliente', 'clients', [
      ['Código', input('id', 'text', '', { maxLength: 100 })],
      ['Nombre', input('name', 'text', '', { maxLength: 180 })],
      ['Identidad', input('identity', 'text', '', { required: false, maxLength: 32 })],
      ['Teléfono', input('phone', 'tel', '', { required: false, maxLength: 40 })],
      ['Dirección', input('address', 'text', '', { required: false, maxLength: 250 })],
    ], data => ({ ...data, id: data.id.trim().toUpperCase() }));
  }
  if (canUse('pending', role === 'sales') && available.length && clients.length) operation('Apartar solar', 'reservations', [
      ['Solar', select('lot_id', available)], ['Cliente', select('client_id', clients)],
      ['Vence el', input('reserved_until', 'date', today(), { min: today() })],
    ], data => data);
    if (canUse('sales', role === 'sales') && lots.length && clients.length) {
      const lot = select('lot_id', lots.map(item => [item.id, item.id]));
      const client = select('client_id', clients);
      const reservation = input('reservation_id', 'hidden', '', { required: false });
      const months = input('months', 'number', '0', { min: '0', max: '360' });
      const down = input('down', 'number', '0', { min: '0', step: '.01' });
      const form = operation('Registrar venta', 'sales', [
        ['Solar', lot], ['Cliente', client], ['Fecha', input('date', 'date', today(), { max: today() })],
        ['Meses de crédito (0 para contado)', months], ['Prima en lempiras', down],
        ['Primera cuota (opcional)', input('first_due_date', 'date', '', { required: false })],
      ], data => ({ lot_id: data.lot_id, client_id: client.value, date: data.date, months: Number(data.months),
        down_cents: cents(data.down), ...(data.first_due_date && { first_due_date: data.first_due_date }), ...(reservation.value && { reservation_id: reservation.value }) }));
      form.append(reservation);
      lot.onchange = () => {
        const apart = active.find(item => item.lot_id === lot.value);
        client.disabled = !!apart;
        if (apart) client.value = apart.client_id;
        reservation.value = apart?.id ?? '';
      };
      months.oninput = () => { down.readOnly = Number(months.value) === 0; };
      months.oninput();
    }
  if (canUse('cash', role === 'cashier') && catalog.sales.length) renderPaymentForm();
}
function renderPaymentForm() {
  const form = element('form');
  form.className = 'card';
  form.dataset.panel = 'cash';
  form.hidden = activeModule !== 'cash';
  const choices = catalog.sales.map(sale => [sale.id, sale.lot_id + ' · ' + clientName(sale.client_id)]);
  const date = input('date', 'date', today(), { max: today() });
  const rows = element('div');
  const add = button('Añadir otro solar', async () => addRow());
  const submit = element('button', 'Registrar pago');
  submit.className = 'btn btn-primary';
  const label = (text, field) => {
    const node = element('label', text);
    node.append(field);
    return node;
  };
  function addRow() {
    const row = element('fieldset');
    const sale = select('sale_id', choices);
    const amount = input('amount', 'number', '', { min: '.01', step: '.01' });
    const remove = button('Quitar solar', async () => {
      if (rows.children.length > 1) row.remove();
      update();
    });
    row.append(label('Venta', sale), label('Abono en lempiras', amount), remove);
    rows.append(row);
    update();
  }
  function update() {
    add.hidden = rows.children.length >= Math.min(20, choices.length);
    for (const row of rows.children) row.lastElementChild.hidden = rows.children.length < 2;
  }
  form.append(element('h2', 'Registrar pago'), label('Fecha', date), rows, add, submit);
  addRow();
  form.onsubmit = event => {
    event.preventDefault();
    return run(submit, async () => {
      const entries = Array.from(rows.children, row => ({
        sale_id: row.querySelector('select').value,
        amount_cents: cents(row.querySelector('input').value),
      }));
      const result = entries.length === 1
        ? await mutate('payments', { ...entries[0], date: date.value })
        : await mutate('payment-batches', { date: date.value, entries });
      if (result) await showReceipt((result.payments?.[0] ?? result).receipt);
    });
  };
  $('forms').append(form);
}
function clientName(id) { return catalog.clients.find(client => client.id === id)?.name ?? id; }
async function showSale(id) {
  const sale = await api('sales/' + id);
  const section = $('detail');
  section.hidden = false;
  section.replaceChildren(element('h2', 'Venta · ' + sale.lot_id),
    element('p', clientName(sale.client_id) + ' · Saldo ' + money(sale.balance_cents) + ' · Mora ' + money(sale.overdue_cents)),
    element('p', 'Precio ' + money(sale.price_cents) + ' · Prima pactada ' + money(sale.down_cents) + ' · Total pagado ' + money(sale.paid_cents)));
  if (sale.opening_cents) section.append(element('p', 'Pagado antes de la migración: ' + money(sale.opening_cents)));
  const schedule = element('div'), payments = element('div');
  table(schedule, ['Cuota', 'Vence', 'Importe', 'Pendiente', 'Estado'], sale.installments.map(row =>
    [row.number, row.due, money(row.amount_cents), money(row.pending_cents), labels[row.status]]));
  table(payments, ['Recibo', 'Fecha', 'Importe', ''], sale.payments.map(row =>
    [row.receipt, row.payment_date, money(row.amount_cents), canUse('cash') ? button('Ver recibo', () => showReceipt(row.receipt)) : '']));
  section.append(element('h3', 'Cuotas'), schedule, element('h3', 'Pagos'), payments);
  if (actor.role === 'admin') section.append(button('Anular venta y liberar solar', () =>
    administrativeRemoval('release-sale', sale.id, 'Se liberará el solar y se retirarán sus cuotas y cobros del registro activo. La operación quedará archivada.')));
  section.scrollIntoView({ block: 'start' });
}
async function showReceipt(number) {
  const rows = await api('receipt-details/' + number);
  const section = $('detail');
  const lines = element('div');
  const first = rows[0];
  table(lines, ['Folio', 'Cliente', 'Solar', 'Abono', 'Saldo al emitir'], rows.map(row =>
    [row.legacy_id ?? row.receipt, row.client_name, row.lot_id, money(row.amount_cents), money(row.balance_at_receipt_cents)]));
  section.hidden = false;
  section.replaceChildren(element('h2', 'LOTIGEST · Recibo ' + (first.legacy_id ?? first.receipt)),
    element('p', 'Fecha: ' + first.payment_date), lines,
    element('p', 'Total recibido: ' + money(rows.reduce((sum, row) => sum + row.amount_cents, 0))),
    button('Imprimir o guardar PDF', () => window.print()), button('Ver venta', () => showSale(first.sale_id)));
  if (actor.role === 'admin') section.append(button('Anular cobro', () =>
    administrativeRemoval('void-payment', String(first.receipt), 'Se anulará el recibo completo y se recalculará el saldo.')));
  section.scrollIntoView({ block: 'start' });
}
async function refresh() {
  if (pending) {
    const { saved } = await api('command-status/' + pending.key);
    if (saved) {
      savePending(undefined);
      status('Se confirmó la operación anterior. Consulta los registros actualizados.');
    } else {
      status('Hay una operación sin confirmar. Reintenta con los mismos datos.');
    }
  }
  catalog = await api('catalog');
  const { lots, reservations, sales } = catalog;
  const summary = [
    ['Solares disponibles', lots.filter(lot => lot.status === 'available').length],
    ['Solares apartados', lots.filter(lot => lot.status === 'reserved').length],
    ['Solares vendidos', sales.length],
    ['Valor de ventas', money(sales.reduce((sum, sale) => sum + sale.price_cents, 0))],
  ].map(([label, value]) => {
    const card = element('div');
    card.className = 'card central-section';
    const title = element('div', label);
    title.className = 'stat-label';
    const amount = element('strong', value);
    amount.className = 'stat-value';
    card.append(title, amount);
    return card;
  });
  $('summary').replaceChildren(...summary);
  renderForms();
  table($('clients'), ['Código', 'Nombre', 'Identidad', 'Teléfono', 'Correo', 'Dirección'], catalog.clients.map(row =>
    [row.id, row.name, row.identity, row.phone, row.email, row.address]));
  table($('lots'), ['Solar', 'Precio', 'Estado'], lots.map(lot => [lot.id, money(lot.price_cents), labels[lot.status]]));
  table($('reservations'), ['Solar', 'Cliente', 'Vence', 'Estado', ''], reservations.map(row => [
    row.lot_id, clientName(row.client_id), row.reserved_until, labels[row.status],
    row.status === 'active' && row.reserved_until >= today() && canUse('pending', actor.role === 'sales')
      ? button('Cancelar apartado', () => {
        if (window.confirm('¿Cancelar el apartado de ' + row.lot_id + '?')) return mutate('cancel-reservation', { id: row.id });
      }) : '',
  ]));
  table($('sales'), ['Solar', 'Cliente', 'Fecha', 'Precio', ''], sales.map(sale => [
    sale.lot_id, clientName(sale.client_id), sale.sale_date, money(sale.price_cents),
    sale.id ? button('Ver cuotas y recibos', () => showSale(sale.id)) : '',
  ]));
}
$('login-form').onsubmit = event => {
  event.preventDefault();
  const form = event.currentTarget;
  return run(event.submitter, async () => {
    const token = new FormData(form).get('token').trim();
    form.reset();
    showUser(await api('session', { token }));
    await refresh();
    await synchronize();
  });
};
$('logout').onclick = event => run(event.currentTarget, async () => {
  await api('logout', {});
  showUser(null);
});
$('refresh').onclick = event => run(event.currentTarget, async () => {
  if (navigator.onLine) await refresh();
  await synchronize();
});
window.addEventListener('online', () => run(null, synchronize));
window.addEventListener('offline', () => run(null, renderQueue));
setInterval(() => {
  if (actor && navigator.onLine) run(null, async () => {
    if ((await operationQueue().list(actor.name)).length) await synchronize();
  });
}, 30_000);
run(null, async () => {
  try { showUser(await api('me')); } catch (error) {
    if (error.status !== 401) throw error;
    return;
  }
  await refresh();
  await synchronize();
});

const documentLabels = {
  name: 'Nombre', identity: 'Identidad', phone: 'Teléfono', address: 'Dirección',
  residence: 'Residencial', block: 'Bloque', lot: 'Solar', area: 'Medidas',
  price: 'Precio', down: 'Prima', months: 'Plazo', firstDue: 'Primera cuota',
  paid: 'Pagado según documento', balance: 'Saldo según documento',
};

async function loadDocuments() {
  const documents = await api('documents');
  table($('documents'), ['Contrato', 'Cliente', 'Fecha', ''], documents.map(row => [
    row.title, clientName(row.client_id), row.created_at,
    button('Ver texto', async () => {
      const record = await api('documents/' + row.id);
      const detail = $('detail');
      detail.hidden = false;
      detail.replaceChildren(element('h2', record.title));
      record.pages.forEach((page, index) => {
        detail.append(element('h3', 'Página ' + (index + 1)), element('pre', page));
      });
    }),
  ]));
}

function renderDocumentScanner() {
  const form = element('form');
  form.className = 'card';
  form.dataset.panel = 'documents';
  form.hidden = activeModule !== 'documents';
  const titled = (label, node) => {
    const container = element('label', label);
    container.append(node);
    return container;
  };
  const title = input('title', 'text', '', { maxLength: 160 });
  const client = select('client_id', catalog.clients.map(row => [row.id, row.name + ' · ' + row.id]));
  const fields = Object.fromEntries(documentFields.map(key => [key, input(key, 'text', '', { required: false, maxLength: 250 })]));
  const photos = [];
  const picker = input('image', 'file', '', { required: false, accept: 'image/jpeg,image/png,image/webp', capture: 'environment' });
  const pages = element('div');
  const note = element('p', 'Toma o adjunta hasta tres fotos. Revisa el texto y los campos antes de guardar.');
  const submit = element('button', 'Guardar contrato revisado');
  submit.className = 'btn btn-primary';
  submit.disabled = true;
  picker.onchange = async () => {
    const file = picker.files[0];
    picker.value = '';
    if (!file || photos.length >= 3 || picker.disabled) return;
    picker.disabled = true;
    let bitmap;
    try {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) throw new Error('Selecciona una imagen JPG, PNG o WebP de hasta 20 MiB.');
      bitmap = await createImageBitmap(file);
      const canvas = element('canvas');
      const factor = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * factor));
      canvas.height = Math.max(1, Math.round(bitmap.height * factor));
      const context = canvas.getContext('2d');
      context.fillStyle = 'white';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const image = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!image) throw new Error('No se pudo preparar la imagen.');
      const preview = element('img');
      preview.src = canvas.toDataURL('image/jpeg', 0.72);
      preview.alt = 'Vista previa de la página';
      preview.className = 'scan-preview';
      const editor = element('textarea');
      editor.required = true;
      editor.rows = 7;
      editor.maxLength = 30000;
      const group = element('fieldset');
      const page = { group, editor };
      const remove = button('Quitar página', async () => {
        photos.splice(photos.indexOf(page), 1);
        group.remove();
        picker.disabled = false;
        submit.disabled = !photos.length;
      });
      group.append(preview, titled('Texto revisado', editor), remove);
      photos.push(page);
      pages.append(group);
      submit.disabled = true;
      note.textContent = 'Leyendo la página…';
      try {
        const response = await fetch('/api/v1/document-ocr', { method: 'POST', headers: { 'Content-Type': 'image/png' },
          body: image, signal: AbortSignal.timeout(25000) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        editor.value = body.text;
        for (const [key, value] of Object.entries(extractDocumentFields(photos.map(row => row.editor.value)))) {
          if (!fields[key].value) fields[key].value = value.slice(0, 250);
        }
        note.textContent = 'Revisa el texto y confirma los campos detectados.';
      } catch (error) {
        note.textContent = error.message + ' Puedes transcribir el texto de esta página.';
      } finally { submit.disabled = !photos.length; }
    } catch (error) { note.textContent = error.message; }
    finally { bitmap?.close(); picker.disabled = photos.length >= 3; }
  };
  const detect = button('Volver a detectar campos', async () => {
    const found = extractDocumentFields(photos.map(page => page.editor.value));
    for (const [key, value] of Object.entries(found)) if (!fields[key].value) fields[key].value = value.slice(0, 250);
    note.textContent = 'Se completaron los campos vacíos que se pudieron identificar.';
  });
  const prepareClient = button('Pasar datos a ficha de cliente', async () => {
    const target = $('forms').querySelector('[data-operation="clients"]');
    if (!target) return;
    for (const key of ['name', 'identity', 'phone', 'address']) target.elements[key].value = fields[key].value;
    showModule('clients');
    target.scrollIntoView({ block: 'start' });
    status('Revisa la ficha del cliente antes de guardarla.');
  });
  const prepareSale = button('Preparar venta con datos revisados', async () => {
    const target = $('forms').querySelector('[data-operation="sales"]');
    const lot = catalog.lots.find(row => row.id.toUpperCase() === fields.lot.value.trim().toUpperCase());
    if (!target || !lot || !client.value || !Array.from(target.elements.lot_id.options).some(option => option.value === lot.id)) {
      throw new Error('Selecciona un cliente existente y un solar disponible o apartado antes de preparar la venta.');
    }
    const amount = value => /^\d+(?:\.\d{1,2})?$/.test(value) ? cents(value) : null;
    const price = amount(fields.price.value.trim());
    if (fields.price.value.trim() && price !== lot.price_cents) throw new Error('El precio del documento debe coincidir con el precio registrado del solar.');
    const months = /^\d{1,3}$/.test(fields.months.value.trim()) ? Number(fields.months.value) : NaN;
    const down = amount(fields.down.value.trim());
    if (!Number.isInteger(months) || months < 0 || months > 360 || (months && (down == null || down >= lot.price_cents))) {
      throw new Error('Escribe el plazo como número de meses (0 para contado) y la prima como importe decimal.');
    }
    const reservation = catalog.reservations.find(row => row.lot_id === lot.id && row.status === 'active' && row.reserved_until >= today());
    if (reservation && reservation.client_id !== client.value) throw new Error('El solar está apartado para otro cliente.');
    target.elements.lot_id.value = lot.id;
    target.elements.lot_id.dispatchEvent(new Event('change'));
    target.elements.client_id.value = client.value;
    target.elements.months.value = months;
    target.elements.months.dispatchEvent(new Event('input'));
    target.elements.down.value = months ? down / 100 : 0;
    target.elements.first_due_date.value = fields.firstDue.value.trim();
    if (fields.firstDue.value.trim() && !target.elements.first_due_date.value) {
      throw new Error('Escribe la fecha de la primera cuota como AAAA-MM-DD.');
    }
    showModule('sales');
    target.scrollIntoView({ block: 'start' });
    status('Revisa la fecha y los datos antes de registrar la venta. Los saldos y pagos del documento quedaron como referencia.');
  });
  form.onsubmit = event => {
    event.preventDefault();
    if (!photos.length) return;
    return run(submit, async () => {
      await mutate('documents', { title: title.value, client_id: client.value,
        pages: photos.map(page => page.editor.value),
        fields: Object.fromEntries(documentFields.map(key => [key, fields[key].value])) });
      await loadDocuments();
    });
  };
  form.append(element('h2', 'Escanear documento'), titled('Cliente existente', client), titled('Título del contrato', title),
    titled('Fotografiar o adjuntar página', picker), note, pages, detect,
    ...documentFields.map(key => titled(documentLabels[key], fields[key])), prepareClient, prepareSale, submit);
  $('forms').append(form);
}

async function administrativeRemoval(route, id, warning) {
  const reason = window.prompt(warning + '\nMotivo obligatorio:');
  if (!reason?.trim()) return;
  const result = await mutate(route, { id, reason });
  if (result) $('detail').hidden = true;
}

function renderUserSettings() {
  const name = input('name', 'text', '', { maxLength: 100 });
  const role = select('role', [['normal','Normal'],['admin','Administrador']]);
  role.value = 'normal';
  const list = element('fieldset');
  const checks = navigation.filter(item => item.dataset.module !== 'settings').map(item => {
    const check = input('panel', 'checkbox', item.dataset.module, { required: false });
    const label = element('label', item.querySelector('em').textContent);
    label.prepend(check);
    list.append(label);
    return check;
  });
  role.onchange = () => { list.hidden = role.value === 'admin'; };
  const form = element('form');
  form.className = 'card';
  form.dataset.panel = 'settings';
  form.hidden = activeModule !== 'settings';
  for (const [text, field] of [['Usuario nuevo o existente', name], ['Tipo de usuario', role]]) {
    const label = element('label', text);
    label.append(field);
    form.append(label);
  }
  const rotate = input('rotate', 'checkbox', 'yes', { required: false });
  const rotateLabel = element('label', 'Generar o reemplazar la credencial de acceso');
  rotateLabel.prepend(rotate);
  const submit = element('button', 'Guardar usuario');
  submit.className = 'btn btn-primary';
  form.prepend(element('h2', 'Usuarios y permisos'));
  form.append(list, rotateLabel, submit);
  form.onsubmit = event => {
    event.preventDefault();
    return run(submit, async () => {
      const token = rotate.checked ? Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2,'0')).join('') : undefined;
      try {
        const result = await api('manage-user', { name: name.value.trim(), role: role.value,
          panels: checks.filter(check => check.checked).map(check => check.value), ...(token && { token }) }, crypto.randomUUID());
        status('Usuario guardado: ' + result.name);
        if (token) window.prompt('Copia la credencial y entrégala al usuario por un medio privado.', token);
      } catch (error) {
        if (token && !error.status) window.prompt('No se confirmó el cambio. Conserva esta credencial para comprobar el acceso.', token);
        throw error;
      }
      await loadSettings();
    });
  };
  $('forms').append(form);
}
async function loadSettings() {
  const [users, log] = await Promise.all([api('users'), api('removal-log')]);
  const output = $('removal-log');
  table(output, ['Fecha UTC', 'Administrador', 'Acción', 'Referencia', 'Motivo', 'Detalle'], log.map(row =>
    [row.created_at, row.actor, row.action === 'release-sale' ? 'Anular venta y liberar solar' : 'Anular cobro', row.target, row.reason, button('Ver datos archivados', async () => {
      const record = await api('removal-log/' + row.id);
      $('detail').replaceChildren(element('h2', 'Registro de anulación'), element('pre', JSON.stringify(record.snapshot, null, 2)));
      $('detail').hidden = false;
      $('detail').scrollIntoView({ block: 'start' });
    })]));
  output.prepend(element('h3', 'Usuarios actuales'), element('p', users.map(row =>
    row.name + ' (' + (row.panels ? row.panels.map(panel => navigation.find(item => item.dataset.module === panel)?.textContent.trim()).join(', ') || 'sin paneles' : roles[row.role]) + ')').join(' · ')));
}
