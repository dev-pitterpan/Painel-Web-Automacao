import Database from "better-sqlite3";
import pg from "pg";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const { Client } = pg;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const connectionString = String(
  process.env.DIRECT_URL || process.env.DATABASE_URL || "",
).trim();
if (!connectionString) throw new Error("Defina DIRECT_URL ou DATABASE_URL.");
const sqlitePath =
  process.env.AUTH_DATABASE_FILE || path.join(root, "data", "auth.db");
const source = new Database(sqlitePath, { readonly: true });
const client = new Client({ connectionString });

function hasTable(name) {
  return Boolean(
    source
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
      .get(name),
  );
}
function columns(name) {
  return new Set(
    source
      .prepare(`PRAGMA table_info(${name})`)
      .all()
      .map((row) => row.name),
  );
}
function value(row, field, fallback = null) {
  return Object.prototype.hasOwnProperty.call(row, field)
    ? row[field]
    : fallback;
}

await client.connect();
try {
  const schema = await readFile(
    path.join(root, "database", "schema.sql"),
    "utf8",
  );
  await client.query(schema);
  const existing = await client.query(
    "SELECT (SELECT COUNT(*) FROM users)::int AS users, (SELECT COUNT(*) FROM reprocess_jobs)::int AS jobs, (SELECT COUNT(*) FROM audit_logs)::int AS audits",
  );
  const totals = existing.rows[0];
  if (
    !process.env.ALLOW_NONEMPTY_IMPORT &&
    (totals.users || totals.jobs || totals.audits)
  ) {
    throw new Error(
      "O destino já contém dados. Use o script de mesclagem ou ALLOW_NONEMPTY_IMPORT=1 conscientemente.",
    );
  }

  await client.query("BEGIN");
  const counts = { users: 0, jobs: 0, audits: 0, settings: 0 };
  const userIds = new Map();
  if (hasTable("users")) {
    const fields = columns("users");
    for (const row of source.prepare("SELECT * FROM users ORDER BY id").all()) {
      const result = await client.query(
        `INSERT INTO users (id,name,email,password_hash,role,created_at,avatar_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT(email) DO UPDATE SET name=EXCLUDED.name,password_hash=EXCLUDED.password_hash,role=EXCLUDED.role,avatar_url=EXCLUDED.avatar_url
         RETURNING id`,
        [
          row.id,
          row.name,
          row.email,
          row.password_hash,
          row.role,
          row.created_at,
          fields.has("avatar_url") ? row.avatar_url : null,
        ],
      );
      userIds.set(Number(row.id), Number(result.rows[0].id));
      counts.users++;
    }
  }
  if (hasTable("reprocess_jobs")) {
    const fields = columns("reprocess_jobs");
    for (const row of source
      .prepare("SELECT * FROM reprocess_jobs ORDER BY id")
      .all()) {
      const mappedUser = userIds.get(Number(row.user_id));
      if (!mappedUser) continue;
      await client.query(
        `INSERT INTO reprocess_jobs (id,request_id,sku,title,historical_date,user_id,status,result_json,source,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10) ON CONFLICT(request_id) DO NOTHING`,
        [
          row.id,
          row.request_id,
          row.sku,
          row.title,
          row.historical_date,
          mappedUser,
          row.status,
          row.result_json || null,
          fields.has("source") ? row.source : "reprocess",
          row.created_at,
        ],
      );
      counts.jobs++;
    }
  }
  if (hasTable("audit_logs")) {
    for (const row of source
      .prepare("SELECT * FROM audit_logs ORDER BY id")
      .all()) {
      await client.query(
        `INSERT INTO audit_logs (id,user_id,action,entity,details_json,created_at)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6) ON CONFLICT(id) DO NOTHING`,
        [
          row.id,
          userIds.get(Number(row.user_id)) || null,
          row.action,
          row.entity,
          row.details_json || null,
          row.created_at,
        ],
      );
      counts.audits++;
    }
  }
  if (hasTable("app_settings")) {
    for (const row of source.prepare("SELECT * FROM app_settings").all()) {
      await client.query(
        `INSERT INTO app_settings (key,value,updated_at) VALUES ($1,$2,$3)
         ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`,
        [row.key, row.value, row.updated_at],
      );
      counts.settings++;
    }
  }
  for (const table of ["users", "reprocess_jobs", "audit_logs"]) {
    await client.query(
      `SELECT setval(pg_get_serial_sequence('${table}','id'), GREATEST(COALESCE((SELECT MAX(id) FROM ${table}),1),1), true)`,
    );
  }
  await client.query("COMMIT");
  console.log(
    `Importação conferida: ${counts.users} usuário(s), ${counts.jobs} processamento(s), ${counts.audits} evento(s), ${counts.settings} configuração(ões).`,
  );
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  source.close();
  await client.end();
}
