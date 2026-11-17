CREATE TABLE IF NOT EXISTS app_login_limits (ip_hash TEXT PRIMARY KEY, window_start INTEGER NOT NULL, attempts INTEGER NOT NULL);
