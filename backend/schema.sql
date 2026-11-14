PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  name TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('admin','sales','cashier','reader')),
  token_hash TEXT NOT NULL UNIQUE
) STRICT;
CREATE TABLE IF NOT EXISTS lots (
  id TEXT PRIMARY KEY,
  price_cents INTEGER NOT NULL CHECK (price_cents > 0)
) STRICT;
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  lot_id TEXT NOT NULL REFERENCES lots(id),
  client_id TEXT NOT NULL REFERENCES clients(id),
  reserved_until TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','converted','cancelled','expired'))
) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS one_active_reservation ON reservations(lot_id) WHERE status='active';
CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  lot_id TEXT NOT NULL UNIQUE REFERENCES lots(id),
  client_id TEXT NOT NULL REFERENCES clients(id),
  reservation_id TEXT UNIQUE REFERENCES reservations(id),
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  down_cents INTEGER NOT NULL CHECK (down_cents BETWEEN 0 AND price_cents),
  months INTEGER NOT NULL CHECK (months BETWEEN 0 AND 360),
  sale_date TEXT NOT NULL,
  CHECK ((months = 0 AND down_cents = price_cents) OR (months > 0 AND down_cents < price_cents))
) STRICT;
CREATE TABLE IF NOT EXISTS payments (
  receipt INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id TEXT NOT NULL REFERENCES sales(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  payment_date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('cash','down','installment'))
) STRICT;
CREATE TABLE IF NOT EXISTS commands (
  actor TEXT NOT NULL REFERENCES users(name),
  request_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  response TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (actor,request_id)
) STRICT;
CREATE TABLE IF NOT EXISTS legacy_sale_terms (
  sale_id TEXT PRIMARY KEY REFERENCES sales(id),
  opening_cents INTEGER NOT NULL CHECK (opening_cents >= 0),
  first_due_date TEXT
) STRICT;
CREATE TABLE IF NOT EXISTS legacy_receipts (
  receipt INTEGER PRIMARY KEY REFERENCES payments(receipt),
  legacy_id TEXT NOT NULL UNIQUE
) STRICT;
CREATE TABLE IF NOT EXISTS payment_groups (
  receipt INTEGER PRIMARY KEY REFERENCES payments(receipt),
  group_id TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS payment_groups_id ON payment_groups(group_id);
CREATE INDEX IF NOT EXISTS payments_sale_receipt ON payments(sale_id, receipt);
CREATE TABLE IF NOT EXISTS client_contacts (
  client_id TEXT PRIMARY KEY REFERENCES clients(id),
  identity TEXT UNIQUE,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT ''
) STRICT;
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  title TEXT NOT NULL,
  pages_json TEXT NOT NULL,
  fields_json TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(name),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
CREATE INDEX IF NOT EXISTS documents_by_client ON documents(client_id, created_at);
CREATE TABLE IF NOT EXISTS sale_due_dates (
  sale_id TEXT PRIMARY KEY REFERENCES sales(id),
  first_due_date TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS user_panels (
  name TEXT PRIMARY KEY REFERENCES users(name),
  panels_json TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS removal_log (
  id INTEGER PRIMARY KEY,
  actor TEXT NOT NULL REFERENCES users(name),
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  reason TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
CREATE TABLE IF NOT EXISTS void_payments (
  receipt INTEGER PRIMARY KEY REFERENCES payments(receipt)
) STRICT;
