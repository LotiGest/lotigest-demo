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
