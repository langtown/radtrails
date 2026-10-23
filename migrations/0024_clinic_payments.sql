CREATE TABLE clinic_orders (
  session_id TEXT PRIMARY KEY,
  payment_status TEXT NOT NULL,
  amount_total INTEGER,
  currency TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE clinic_stripe_events (
  event_id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
