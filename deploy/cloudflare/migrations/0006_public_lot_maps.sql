-- Publicar enlaces de solares y recibir consultas sin exponer expedientes ni precios.
-- Migración aditiva: aplicar antes de activar las rutas públicas.
CREATE TABLE IF NOT EXISTS public_lot_maps (
 residence_id TEXT PRIMARY KEY,
 slug TEXT NOT NULL UNIQUE,
 title TEXT NOT NULL,
 geometry_json TEXT NOT NULL,
 published_by TEXT NOT NULL,
 published_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS public_lot_requests (
 id TEXT PRIMARY KEY,
 slug TEXT NOT NULL REFERENCES public_lot_maps(slug),
 residence_id TEXT NOT NULL,
 lot_id TEXT NOT NULL,
 name TEXT NOT NULL,
 phone TEXT NOT NULL,
 mode TEXT NOT NULL,
 proposed_down_payment REAL NOT NULL DEFAULT 0,
 payment_date TEXT NOT NULL,
 note TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','quoted','approved','rejected')),
 quote_json TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS public_lot_requests_residence ON public_lot_requests(residence_id, created_at DESC);
CREATE TABLE IF NOT EXISTS public_lot_request_limits (
 ip_hash TEXT PRIMARY KEY,
 window_start INTEGER NOT NULL,
 attempts INTEGER NOT NULL
);
