const aliases = {
  id: ['codigo', 'codigocliente', 'idcliente', 'id'],
  name: ['nombre', 'nombrecompleto', 'cliente', 'nombredelcliente', 'nombresyapellidos'],
  identity: ['identidad', 'dni', 'cedula', 'numerodeidentidad', 'documento'],
  phone: ['telefono', 'celular', 'movil', 'whatsapp'],
  email: ['correo', 'email', 'correoelectronico'],
  address: ['direccion', 'domicilio'],
};
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function mapClientRows(rows, existing = []) {
  if (!Array.isArray(rows) || rows.length < 2 || rows.length > 101) throw new Error('El archivo debe tener encabezados y entre 1 y 100 clientes.');
  const [headers, ...body] = rows;
  const columns = new Map();
  for (const [index, heading] of headers.entries()) {
    const key = Object.keys(aliases).find(field => aliases[field].includes(normalize(heading)));
    if (!key) continue;
    if (columns.has(key)) throw new Error('Hay dos columnas para el mismo campo: ' + heading);
    columns.set(key, index);
  }
  if (!columns.has('name') || (!columns.has('id') && !columns.has('identity'))) {
    throw new Error('El archivo debe incluir Nombre y Código o Identidad.');
  }
  const ids = new Set(existing.map(item => item.id.toUpperCase()));
  const identities = new Set(existing.map(item => item.identity).filter(Boolean));
  const clients = body.map((row, index) => {
    const record = Object.fromEntries([...columns].map(([key, column]) => [key, String(row[column] ?? '').trim()]));
    const identity = (record.identity || '').toUpperCase().replace(/[ -]/g, '');
    const id = (record.id || (identity && 'ID-' + identity)).toUpperCase();
    const email = record.email || '';
    if (!/^[A-Z0-9_-]{1,100}$/.test(id) || !record.name || record.name.length > 180 ||
        (identity && (!/^[A-Z0-9]+$/.test(identity) || identity.length > 32)) ||
        (record.phone || '').length > 40 || email.length > 180 ||
        (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) || (record.address || '').length > 250) {
      throw new Error('Registro ' + (index + 1) + ': revisa código, nombre, identidad o contacto.');
    }
    if (ids.has(id) || (identity && identities.has(identity))) throw new Error('Registro ' + (index + 1) + ': código o identidad duplicados.');
    ids.add(id);
    if (identity) identities.add(identity);
    return { ...record, id, identity };
  });
  const used = new Set(columns.values());
  return { clients, ignored: headers.filter((heading, index) => heading && !used.has(index)) };
}
