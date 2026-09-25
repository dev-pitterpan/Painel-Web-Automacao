import Database from "better-sqlite3";
import { neon } from "@neondatabase/serverless";
import path from "node:path";

const databaseUrl = String(process.env.DATABASE_URL || "").trim();
if (!databaseUrl) throw new Error("Defina DATABASE_URL antes de executar a migração.");

const sqlitePath = process.env.AUTH_DATABASE_FILE || path.join(process.cwd(), "data", "auth.db");
const source = new Database(sqlitePath, { readonly: true });
const sql = neon(databaseUrl);
const query = (text, params = []) => sql.query(text, params);

const schema = [
  `CREATE TABLE IF NOT EXISTS users (id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at BIGINT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS login_attempts (identifier TEXT PRIMARY KEY, failures INTEGER NOT NULL DEFAULT 0, blocked_until BIGINT NOT NULL DEFAULT 0, updated_at BIGINT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS reprocess_jobs (id BIGSERIAL PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, sku TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', historical_date TEXT, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, status TEXT NOT NULL DEFAULT 'enviado', result_json JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS audit_logs (id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id) ON DELETE SET NULL, action TEXT NOT NULL, entity TEXT NOT NULL, details_json JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC)`,
];
for (const statement of schema) await query(statement);

const users = source.prepare("SELECT * FROM users ORDER BY id").all();
for (const row of users) await query(
  `INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES ($1,$2,$3,$4,$5,$6)
   ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,email=EXCLUDED.email,password_hash=EXCLUDED.password_hash,role=EXCLUDED.role,created_at=EXCLUDED.created_at`,
  [row.id, row.name, row.email, row.password_hash, row.role, row.created_at],
);

const jobs = source.prepare("SELECT * FROM reprocess_jobs ORDER BY id").all();
for (const row of jobs) await query(
  `INSERT INTO reprocess_jobs (id,request_id,sku,title,historical_date,user_id,status,result_json,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
   ON CONFLICT (request_id) DO UPDATE SET sku=EXCLUDED.sku,title=EXCLUDED.title,historical_date=EXCLUDED.historical_date,user_id=EXCLUDED.user_id,status=EXCLUDED.status,result_json=EXCLUDED.result_json,created_at=EXCLUDED.created_at`,
  [row.id, row.request_id, row.sku, row.title, row.historical_date, row.user_id, row.status, row.result_json || null, row.created_at],
);

const audits = source.prepare("SELECT * FROM audit_logs ORDER BY id").all();
for (const row of audits) await query(
  `INSERT INTO audit_logs (id,user_id,action,entity,details_json,created_at) VALUES ($1,$2,$3,$4,$5::jsonb,$6)
   ON CONFLICT (id) DO UPDATE SET user_id=EXCLUDED.user_id,action=EXCLUDED.action,entity=EXCLUDED.entity,details_json=EXCLUDED.details_json,created_at=EXCLUDED.created_at`,
  [row.id, row.user_id, row.action, row.entity, row.details_json || null, row.created_at],
);

const settings = source.prepare("SELECT * FROM app_settings").all();
for (const row of settings) await query(
  `INSERT INTO app_settings (key,value,updated_at) VALUES ($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`,
  [row.key, row.value, row.updated_at],
);

await query("SELECT setval(pg_get_serial_sequence('users','id'), GREATEST(COALESCE((SELECT MAX(id) FROM users),1),1), true)");
await query("SELECT setval(pg_get_serial_sequence('reprocess_jobs','id'), GREATEST(COALESCE((SELECT MAX(id) FROM reprocess_jobs),1),1), true)");
await query("SELECT setval(pg_get_serial_sequence('audit_logs','id'), GREATEST(COALESCE((SELECT MAX(id) FROM audit_logs),1),1), true)");

source.close();
console.log(`Migração concluída: ${users.length} usuário(s), ${jobs.length} reprocessamento(s), ${audits.length} evento(s) e ${settings.length} configuração(ões).`);
