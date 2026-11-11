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
  if (user) $('actor').textContent = user.name + ' · ' + roles[user.role];
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
async function mutate(route, data) {
  const request = JSON.stringify([route, data]);
  if (pending && pending.request !== request) {
    throw new Error('Hay una operación sin confirmar. Reintenta con los mismos datos antes de iniciar otra.');
  }
  pending ??= { request, key: crypto.randomUUID() };
  let result;
  try {
    result = await api(route, data, pending.key);
  } catch (error) {
    if (error.status >= 400 && error.status < 500) pending = undefined;
    else throw new Error('El servidor no confirmó la operación. Reintenta con los mismos datos.');
    throw error;
  }
  pending = undefined;
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
  if (['admin', 'cashier'].includes(role) && catalog.sales.length) operation('Registrar pago', 'payments', [
    ['Venta', select('sale_id', catalog.sales.map(sale => [sale.id, sale.lot_id + ' · ' + clientName(sale.client_id)]))],
    ['Fecha', input('date', 'date', today(), { max: today() })],
    ['Abono en lempiras', input('amount', 'number', '', { min: '.01', step: '.01' })],
  ], data => ({ sale_id: data.sale_id, date: data.date, amount_cents: cents(data.amount) }));
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
    [row.receipt, row.payment_date, money(row.amount_cents), button('Ver recibo', () => showReceipt(sale, row.receipt))]));
  section.append(element('h3', 'Cuotas'), schedule, element('h3', 'Pagos'), payments);
  section.scrollIntoView({ block: 'start' });
}
async function showReceipt(sale, number) {
  const receipt = await api('receipts/' + number);
  const section = $('detail');
  section.replaceChildren(element('h2', 'LOTIGEST · Recibo ' + receipt.receipt),
    element('p', 'Cliente: ' + clientName(sale.client_id)), element('p', 'Solar: ' + sale.lot_id),
    element('p', 'Fecha: ' + receipt.payment_date), element('p', 'Monto: ' + money(receipt.amount_cents)),
    element('p', 'Saldo actual: ' + money(sale.balance_cents)),
    button('Imprimir o guardar PDF', () => window.print()), button('Volver a la venta', () => showSale(sale.id)));
  section.scrollIntoView({ block: 'start' });
}
async function refresh() {
  const [lots, clients, reservations, sales] = await Promise.all(['lots', 'clients', 'reservations', 'sales'].map(path => api(path)));
  catalog = { lots, clients, reservations, sales };
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
