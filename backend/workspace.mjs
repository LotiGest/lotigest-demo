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

let actor, catalog, pending, activeModule = 'overview';
const navigation = Array.from(document.querySelectorAll('[data-module]'));
function showModule(name, { focus = true } = {}) {
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
for (const item of navigation) item.onclick = () => showModule(item.dataset.module);
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
function showUser(user) {
  actor = user;
  $('login').hidden = !!user;
  $('workspace').hidden = !user;
  showModule('overview', { focus: false });
  if (user) {
    $('actor').textContent = user.name + ' · ' + roles[user.role];
    try {
      const saved = JSON.parse(sessionStorage.getItem(pendingKey()));
      pending = saved && typeof saved.key === 'string' && typeof saved.fingerprint === 'string' ? saved : undefined;
    } catch { pending = undefined; }
  }
  else {
    catalog = pending = undefined;
    for (const id of ['summary', 'forms', 'lots', 'clients', 'reservations', 'sales', 'detail']) $(id).replaceChildren();
    $('detail').hidden = true;
  }
}
async function api(path, data, key) {
  const response = await fetch('/api/v1/' + path, data === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key && { 'Idempotency-Key': key }) },
    body: JSON.stringify(data),
  });
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
async function mutate(route, data) {
  const request = new TextEncoder().encode(JSON.stringify([route, data]));
  const bytes = await crypto.subtle.digest('SHA-256', request);
  const fingerprint = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
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
  if (role === 'admin') operation('Registrar solar', 'lots', [
    ['Código', input('id', 'text', '', { maxLength: 100 })],
    ['Precio en lempiras', input('price', 'number', '', { step: '.01', min: '.01' })],
  ], data => ({ id: data.id.trim().toUpperCase(), price_cents: cents(data.price) }));
  if (['admin', 'sales'].includes(role)) {
    renderClientImport();
    operation('Registrar cliente', 'clients', [
      ['Código', input('id', 'text', '', { maxLength: 100 })],
      ['Nombre', input('name', 'text', '', { maxLength: 180 })],
    ], data => ({ id: data.id.trim().toUpperCase(), name: data.name }));
    if (available.length && clients.length) operation('Apartar solar', 'reservations', [
      ['Solar', select('lot_id', available)], ['Cliente', select('client_id', clients)],
      ['Vence el', input('reserved_until', 'date', today(), { min: today() })],
    ], data => data);
    if (lots.length && clients.length) {
      const lot = select('lot_id', lots.map(item => [item.id, item.id]));
      const client = select('client_id', clients);
      const reservation = input('reservation_id', 'hidden', '', { required: false });
      const months = input('months', 'number', '0', { min: '0', max: '360' });
      const down = input('down', 'number', '0', { min: '0', step: '.01' });
      const form = operation('Registrar venta', 'sales', [
        ['Solar', lot], ['Cliente', client], ['Fecha', input('date', 'date', today(), { max: today() })],
        ['Meses de crédito (0 para contado)', months], ['Prima en lempiras', down],
      ], data => ({ lot_id: data.lot_id, client_id: client.value, date: data.date, months: Number(data.months),
        down_cents: cents(data.down), ...(reservation.value && { reservation_id: reservation.value }) }));
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
  }
  if (['admin', 'cashier'].includes(role) && catalog.sales.length) renderPaymentForm();
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
    [row.receipt, row.payment_date, money(row.amount_cents), button('Ver recibo', () => showReceipt(row.receipt))]));
  section.append(element('h3', 'Cuotas'), schedule, element('h3', 'Pagos'), payments);
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
    row.status === 'active' && row.reserved_until >= today() && ['admin', 'sales'].includes(actor.role)
      ? button('Cancelar apartado', () => {
        if (window.confirm('¿Cancelar el apartado de ' + row.lot_id + '?')) return mutate('cancel-reservation', { id: row.id });
      }) : '',
  ]));
  table($('sales'), ['Solar', 'Cliente', 'Fecha', 'Precio', ''], sales.map(sale => [
    sale.lot_id, clientName(sale.client_id), sale.sale_date, money(sale.price_cents),
    button('Ver cuotas y recibos', () => showSale(sale.id)),
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
  });
};
$('logout').onclick = event => run(event.currentTarget, async () => {
  await api('logout', {});
  showUser(null);
});
$('refresh').onclick = event => run(event.currentTarget, refresh);
run(null, async () => {
  try { showUser(await api('me')); } catch (error) {
    if (error.status !== 401) throw error;
    return;
  }
  await refresh();
});
