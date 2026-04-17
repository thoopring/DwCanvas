-- CleanShot D1 Schema v1

-- Users (Google OAuth)
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  google_sub      TEXT NOT NULL UNIQUE,
  email           TEXT NOT NULL,
  name            TEXT,
  picture         TEXT,
  created_at      INTEGER NOT NULL,
  -- LemonSqueezy
  lemon_customer_id     TEXT,
  lemon_subscription_id TEXT,
  lemon_variant_id      TEXT,
  plan            TEXT NOT NULL DEFAULT 'free',
  plan_status     TEXT NOT NULL DEFAULT 'trial',
  current_period_end INTEGER,
  -- Trial: 1 video lifetime
  trial_used      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_lemon ON users(lemon_customer_id);

-- Monthly usage (Creator: 30/mo, Pro: unlimited)
CREATE TABLE IF NOT EXISTS usage_monthly (
  user_id     INTEGER NOT NULL,
  yyyymm      INTEGER NOT NULL,
  videos_used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, yyyymm),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Processed videos (library)
CREATE TABLE IF NOT EXISTS videos (
  id              TEXT PRIMARY KEY,
  user_id         INTEGER NOT NULL,
  youtube_id      TEXT NOT NULL,
  title           TEXT,
  channel         TEXT,
  duration_sec    INTEGER,
  thumbnail_url   TEXT,
  created_at      INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'processing',
  persona         TEXT NOT NULL,
  -- AI results
  insights_json   TEXT,
  carousel_json   TEXT,
  zip_r2_key      TEXT,
  watermarked     INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_videos_user ON videos(user_id, created_at DESC);

-- LemonSqueezy webhook idempotency
CREATE TABLE IF NOT EXISTS lemon_events (
  id          TEXT PRIMARY KEY,
  received_at INTEGER NOT NULL
);
