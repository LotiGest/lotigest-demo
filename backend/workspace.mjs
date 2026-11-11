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

let actor, catalog, pending;
function element(tag, content) {
  const node = document.createElement(tag);
  if (content != null) node.textContent = content;
  return node;
}
function button(label, action) {
  const node = element('button', label);
  node.type = 'button';
  node.onclick = event => run(event.currentTarget, action);
  return node;
}
function status(message = '') { $('status').textContent = message; }
function showUser(user) {
  actor = user;
  $('login').hidden = !!user;
  $('workspace').hidden = !user;
  $('logout').hidden = !user;
  if (user) {
    $('actor').textContent = user.name + ' · ' + roles[user.role];
    try {
      const saved = JSON.parse(sessionStorage.getItem(pendingKey()));
      pending = saved && typeof saved.key === 'string' && typeof saved.fingerprint === 'string' ? saved : undefined;
    } catch { pending = undefined; }
  }
  else {
    catalog = pending = undefined;
    for (const id of ['forms', 'lots', 'reservations', 'sales', 'detail']) $(id).replaceChildren();
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
  form.append(element('h2', title));
  for (const [label, field] of fields) {
    const node = element('label', label);
    node.append(field);
    form.append(node);
  }
  const submit = element('button', 'Guardar');
  form.append(submit);
  form.onsubmit = event => {
    event.preventDefault();
    return run(submit, () => mutate(route, encode(Object.fromEntries(new FormData(form)))));
  };
  $('forms').append(form);
  return form;
}
const cents = value => Math.round(Number(value) * 100);
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
  const choices = catalog.sales.map(sale => [sale.id, sale.lot_id + ' · ' + clientName(sale.client_id)]);
  const date = input('date', 'date', today(), { max: today() });
  const rows = element('div');
  const add = button('Añadir otro solar', async () => addRow());
  const submit = element('button', 'Registrar pago');
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
    element('p', clientName(sale.client_id) + ' · Saldo ' + money(sale.balance_cents) + ' · Mora ' + money(sale.overdue_cents)));
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
  renderForms();
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
