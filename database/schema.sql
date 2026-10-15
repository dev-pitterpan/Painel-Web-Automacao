CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  avatar_url TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
  identifier TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  blocked_until BIGINT NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS reprocess_jobs (
  id BIGSERIAL PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  sku TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  historical_date TEXT,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'enviado',
  result_json JSONB,
  source TEXT NOT NULL DEFAULT 'reprocess',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  details_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_overrides (
  sku TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  collections_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  weight DOUBLE PRECISION NOT NULL DEFAULT 0,
  weight_unit TEXT NOT NULL DEFAULT 'g',
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_overrides_v2 (
  sku TEXT NOT NULL,
  source_title TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  collections_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  weight DOUBLE PRECISION NOT NULL DEFAULT 0,
  weight_unit TEXT NOT NULL DEFAULT 'g',
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (sku, source_title)
);

CREATE TABLE IF NOT EXISTS shopify_catalog_products (
  shopify_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  handle TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'DRAFT',
  vendor TEXT NOT NULL DEFAULT '',
  product_type TEXT NOT NULL DEFAULT '',
  tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  collections_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  description_html TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  image_alt TEXT NOT NULL DEFAULT '',
  media_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  weight DOUBLE PRECISION NOT NULL DEFAULT 0,
  weight_unit TEXT NOT NULL DEFAULT 'g',
  primary_sku TEXT NOT NULL DEFAULT '',
  variants_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_inventory INTEGER NOT NULL DEFAULT 0,
  price_min DOUBLE PRECISION NOT NULL DEFAULT 0,
  price_max DOUBLE PRECISION NOT NULL DEFAULT 0,
  shopify_updated_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shopify_catalog_sync_runs (
  batch_id TEXT PRIMARY KEY,
  shopify_operation_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'processing',
  expected_count INTEGER,
  received_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT NOT NULL DEFAULT '',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS shopify_catalog_staging (
  batch_id TEXT NOT NULL REFERENCES shopify_catalog_sync_runs(batch_id) ON DELETE CASCADE,
  shopify_id TEXT NOT NULL,
  title TEXT NOT NULL,
  handle TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'DRAFT',
  vendor TEXT NOT NULL DEFAULT '',
  product_type TEXT NOT NULL DEFAULT '',
  tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  collections_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  description_html TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  image_alt TEXT NOT NULL DEFAULT '',
  media_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  weight DOUBLE PRECISION NOT NULL DEFAULT 0,
  weight_unit TEXT NOT NULL DEFAULT 'g',
  primary_sku TEXT NOT NULL DEFAULT '',
  variants_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_inventory INTEGER NOT NULL DEFAULT 0,
  price_min DOUBLE PRECISION NOT NULL DEFAULT 0,
  price_max DOUBLE PRECISION NOT NULL DEFAULT 0,
  shopify_updated_at TIMESTAMPTZ,
  PRIMARY KEY (batch_id, shopify_id)
);

CREATE TABLE IF NOT EXISTS winthor_product_statuses (
  sku TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'FORA_DE_LINHA',
  batch_id TEXT NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (batch_id, sku)
);

CREATE TABLE IF NOT EXISTS winthor_sync_runs (
  id BIGSERIAL PRIMARY KEY,
  batch_id TEXT NOT NULL UNIQUE,
  source_file TEXT NOT NULL DEFAULT '',
  item_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS image_sync_jobs (
  id BIGSERIAL PRIMARY KEY,
  batch_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  image_position INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
  image_base64 TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_until TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(batch_id, image_position)
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_image_sync_jobs_pending ON image_sync_jobs(status, lease_until, id);
CREATE INDEX IF NOT EXISTS idx_shopify_catalog_title ON shopify_catalog_products(title);
CREATE INDEX IF NOT EXISTS idx_shopify_catalog_sku ON shopify_catalog_products(primary_sku);
CREATE INDEX IF NOT EXISTS idx_shopify_catalog_updated ON shopify_catalog_products(shopify_updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_shopify_staging_batch ON shopify_catalog_staging(batch_id);
CREATE INDEX IF NOT EXISTS idx_winthor_status_synced ON winthor_product_statuses(synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_winthor_status_sku ON winthor_product_statuses(sku);
CREATE INDEX IF NOT EXISTS idx_reprocess_jobs_sku_created ON reprocess_jobs ((LOWER(TRIM(sku))), created_at DESC);

