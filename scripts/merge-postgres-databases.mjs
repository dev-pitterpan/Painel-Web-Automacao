import pg from "pg";

const { Client } = pg;
const sourceUrl = String(process.env.SOURCE_DATABASE_URL || "").trim();
const targetUrl = String(
  process.env.TARGET_DATABASE_URL || process.env.DIRECT_URL || "",
).trim();
if (!sourceUrl || !targetUrl) {
  throw new Error(
    "Defina SOURCE_DATABASE_URL (Neon antigo) e TARGET_DATABASE_URL ou DIRECT_URL (Prisma atual).",
  );
}
if (sourceUrl === targetUrl)
  throw new Error("Origem e destino não podem ser iguais.");

const source = new Client({ connectionString: sourceUrl });
const target = new Client({ connectionString: targetUrl });
const exists = async (client, table) => {
  const { rows } = await client.query(
    "SELECT to_regclass($1) IS NOT NULL AS exists",
    [`public.${table}`],
  );
  return Boolean(rows[0]?.exists);
};

await Promise.all([source.connect(), target.connect()]);
const summary = {};
try {
  await target.query("BEGIN");

  const users = (await source.query("SELECT * FROM users ORDER BY id")).rows;
  const userMap = new Map();
  for (const row of users) {
    const result = await target.query(
      `INSERT INTO users (name,email,password_hash,role,created_at,avatar_url)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(email) DO NOTHING RETURNING id`,
      [
        row.name,
        row.email,
        row.password_hash,
        row.role,
        row.created_at,
        row.avatar_url || null,
      ],
    );
    const id =
      result.rows[0]?.id ??
      (await target.query("SELECT id FROM users WHERE email=$1", [row.email]))
        .rows[0].id;
    userMap.set(String(row.id), Number(id));
  }
  summary.users = users.length;

  if (await exists(source, "app_settings")) {
    const rows = (await source.query("SELECT * FROM app_settings")).rows;
    for (const row of rows)
      await target.query(
        `INSERT INTO app_settings (key,value,updated_at) VALUES ($1,$2,$3)
       ON CONFLICT(key) DO UPDATE SET value=CASE WHEN app_settings.updated_at < EXCLUDED.updated_at THEN EXCLUDED.value ELSE app_settings.value END,
       updated_at=GREATEST(app_settings.updated_at,EXCLUDED.updated_at)`,
        [row.key, row.value, row.updated_at],
      );
    summary.settings = rows.length;
  }

  if (await exists(source, "reprocess_jobs")) {
    const rows = (
      await source.query("SELECT * FROM reprocess_jobs ORDER BY id")
    ).rows;
    for (const row of rows)
      await target.query(
        `INSERT INTO reprocess_jobs (request_id,sku,title,historical_date,user_id,status,result_json,source,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(request_id) DO NOTHING`,
        [
          row.request_id,
          row.sku,
          row.title,
          row.historical_date,
          userMap.get(String(row.user_id)),
          row.status,
          row.result_json,
          row.source || "reprocess",
          row.created_at,
        ],
      );
    summary.reprocess_jobs = rows.length;
  }

  if (await exists(source, "audit_logs")) {
    const rows = (await source.query("SELECT * FROM audit_logs ORDER BY id"))
      .rows;
    for (const row of rows)
      await target.query(
        `INSERT INTO audit_logs (user_id,action,entity,details_json,created_at)
       SELECT $1,$2,$3,$4,$5 WHERE NOT EXISTS (
         SELECT 1 FROM audit_logs WHERE action=$2 AND entity=$3 AND created_at=$5 AND details_json IS NOT DISTINCT FROM $4
       )`,
        [
          row.user_id ? userMap.get(String(row.user_id)) || null : null,
          row.action,
          row.entity,
          row.details_json,
          row.created_at,
        ],
      );
    summary.audit_logs = rows.length;
  }

  if (await exists(source, "product_overrides")) {
    const rows = (await source.query("SELECT * FROM product_overrides")).rows;
    for (const row of rows)
      await target.query(
        `INSERT INTO product_overrides (sku,title,description,tags_json,collections_json,weight,weight_unit,updated_by,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT(sku) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,tags_json=EXCLUDED.tags_json,
       collections_json=EXCLUDED.collections_json,weight=EXCLUDED.weight,weight_unit=EXCLUDED.weight_unit,
       updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at
       WHERE product_overrides.updated_at < EXCLUDED.updated_at`,
        [
          row.sku,
          row.title,
          row.description,
          row.tags_json,
          row.collections_json,
          row.weight,
          row.weight_unit,
          row.updated_by ? userMap.get(String(row.updated_by)) || null : null,
          row.updated_at,
        ],
      );
    summary.product_overrides = rows.length;
  }

  if (await exists(source, "product_overrides_v2")) {
    const rows = (await source.query("SELECT * FROM product_overrides_v2"))
      .rows;
    for (const row of rows)
      await target.query(
        `INSERT INTO product_overrides_v2 (sku,source_title,title,description,tags_json,collections_json,weight,weight_unit,updated_by,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT(sku,source_title) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,tags_json=EXCLUDED.tags_json,
       collections_json=EXCLUDED.collections_json,weight=EXCLUDED.weight,weight_unit=EXCLUDED.weight_unit,
       updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at
       WHERE product_overrides_v2.updated_at < EXCLUDED.updated_at`,
        [
          row.sku,
          row.source_title,
          row.title,
          row.description,
          row.tags_json,
          row.collections_json,
          row.weight,
          row.weight_unit,
          row.updated_by ? userMap.get(String(row.updated_by)) || null : null,
          row.updated_at,
        ],
      );
    summary.product_overrides_v2 = rows.length;
  }

  await target.query("COMMIT");
  console.log(
    "Mesclagem concluída sem substituir registros mais novos do destino:",
    summary,
  );
} catch (error) {
  await target.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await Promise.all([source.end(), target.end()]);
}
