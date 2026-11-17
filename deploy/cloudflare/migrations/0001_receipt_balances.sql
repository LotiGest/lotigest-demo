CREATE TABLE IF NOT EXISTS d1_receipt_balances (
  receipt INTEGER PRIMARY KEY REFERENCES payments(receipt) ON DELETE CASCADE,
  balance_cents INTEGER NOT NULL CHECK(balance_cents >= 0)
) STRICT;
