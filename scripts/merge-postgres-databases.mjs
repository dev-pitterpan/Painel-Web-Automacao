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
const insertMany = async (client, table, columns, rows, conflict = "") => {
  const batchSize = Math.min(500, Math.floor(50000 / columns.length));
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const values = batch.flat();
    const placeholders = batch
      .map(
        (_, rowIndex) =>
          `(${columns.map((__, columnIndex) => `$${rowIndex * columns.length + columnIndex + 1}`).join(",")})`,
      )
      .join(",");
    await client.query(
      `INSERT INTO ${table} (${columns.join(",")}) VALUES ${placeholders} ${conflict}`,
      values,
    );
  }
};
const asJson = (value) =>
  value == null || typeof value === "string" ? value : JSON.stringify(value);

await Promise.all([source.connect(), target.connect()]);
const summary = {};
try {
  await target.query("BEGIN");

  const users = (await source.query("SELECT * FROM users ORDER BY id")).rows;
  const userMap = new Map();
  for (const row of users) {
    const result = await target.query(
      `INSERT INTO users (name,email,password_hash,role,created_at,avatar_url)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT(email) DO UPDATE SET name=EXCLUDED.name,password_hash=EXCLUDED.password_hash,
       role=EXCLUDED.role,avatar_url=EXCLUDED.avatar_url RETURNING id`,
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
    await insertMany(
      target,
      "reprocess_jobs",
      [
        "request_id",
        "sku",
        "title",
        "historical_date",
        "user_id",
        "status",
        "result_json",
        "source",
        "created_at",
      ],
      rows.map((row) => [
        row.request_id,
        row.sku,
        row.title,
        row.historical_date,
        userMap.get(String(row.user_id)),
        row.status,
        asJson(row.result_json),
        row.source || "reprocess",
        row.created_at,
      ]),
      `ON CONFLICT(request_id) DO UPDATE SET sku=EXCLUDED.sku,title=EXCLUDED.title,
       historical_date=EXCLUDED.historical_date,user_id=EXCLUDED.user_id,status=EXCLUDED.status,
       result_json=EXCLUDED.result_json,source=EXCLUDED.source,created_at=EXCLUDED.created_at`,
    );
    summary.reprocess_jobs = rows.length;
  }

  if (await exists(source, "audit_logs")) {
    const rows = (await source.query("SELECT * FROM audit_logs ORDER BY id"))
      .rows;
    await insertMany(
      target,
      "audit_logs",
      ["user_id", "action", "entity", "details_json", "created_at"],
      rows.map((row) => [
        row.user_id ? userMap.get(String(row.user_id)) || null : null,
        row.action,
        row.entity,
        asJson(row.details_json),
        row.created_at,
      ]),
    );
    await target.query(
      `DELETE FROM audit_logs newer USING audit_logs older
       WHERE newer.id > older.id
         AND newer.user_id IS NOT DISTINCT FROM older.user_id
         AND newer.action=older.action AND newer.entity=older.entity
         AND newer.created_at=older.created_at
         AND newer.details_json IS NOT DISTINCT FROM older.details_json`,
    );
    summary.audit_logs = rows.length;
  }

  if (await exists(source, "product_overrides")) {
    const rows = (await source.query("SELECT * FROM product_overrides")).rows;
    await insertMany(
      target,
      "product_overrides",
      [
        "sku",
        "title",
        "description",
        "tags_json",
        "collections_json",
        "weight",
        "weight_unit",
        "updated_by",
        "updated_at",
      ],
      rows.map((row) => [
        row.sku,
        row.title,
        row.description,
        asJson(row.tags_json),
        asJson(row.collections_json),
        row.weight,
        row.weight_unit,
        row.updated_by ? userMap.get(String(row.updated_by)) || null : null,
        row.updated_at,
      ]),
      `ON CONFLICT(sku) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,tags_json=EXCLUDED.tags_json,
       collections_json=EXCLUDED.collections_json,weight=EXCLUDED.weight,weight_unit=EXCLUDED.weight_unit,
       updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at
       WHERE product_overrides.updated_at < EXCLUDED.updated_at`,
    );
    summary.product_overrides = rows.length;
  }

  if (await exists(source, "product_overrides_v2")) {
    const rows = (await source.query("SELECT * FROM product_overrides_v2"))
      .rows;
    await insertMany(
      target,
      "product_overrides_v2",
      [
        "sku",
        "source_title",
        "title",
        "description",
        "tags_json",
        "collections_json",
        "weight",
        "weight_unit",
        "updated_by",
        "updated_at",
      ],
      rows.map((row) => [
        row.sku,
        row.source_title,
        row.title,
        row.description,
        asJson(row.tags_json),
        asJson(row.collections_json),
        row.weight,
        row.weight_unit,
        row.updated_by ? userMap.get(String(row.updated_by)) || null : null,
        row.updated_at,
      ]),
      `ON CONFLICT(sku,source_title) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,tags_json=EXCLUDED.tags_json,
       collections_json=EXCLUDED.collections_json,weight=EXCLUDED.weight,weight_unit=EXCLUDED.weight_unit,
       updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at
       WHERE product_overrides_v2.updated_at < EXCLUDED.updated_at`,
    );
    summary.product_overrides_v2 = rows.length;
  }

  if (await exists(source, "shopify_catalog_sync_runs")) {
    const rows = (await source.query("SELECT * FROM shopify_catalog_sync_runs"))
      .rows;
    for (const row of rows)
      await target.query(
        `INSERT INTO shopify_catalog_sync_runs
         (batch_id,shopify_operation_id,status,expected_count,received_count,error_message,started_at,completed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(batch_id) DO NOTHING`,
        [
          row.batch_id,
          row.shopify_operation_id,
          row.status,
          row.expected_count,
          row.received_count,
          row.error_message,
          row.started_at,
          row.completed_at,
        ],
      );
    summary.shopify_sync_runs = rows.length;
  }

  if (await exists(source, "winthor_sync_runs")) {
    const rows = (await source.query("SELECT * FROM winthor_sync_runs")).rows;
    for (const row of rows)
      await target.query(
        `INSERT INTO winthor_sync_runs (batch_id,source_file,item_count,created_at)
         VALUES ($1,$2,$3,$4) ON CONFLICT(batch_id) DO NOTHING`,
        [row.batch_id, row.source_file, row.item_count, row.created_at],
      );
    summary.winthor_sync_runs = rows.length;
  }

  if (await exists(source, "winthor_product_statuses")) {
    const rows = (await source.query("SELECT * FROM winthor_product_statuses"))
      .rows;
    await insertMany(
      target,
      "winthor_product_statuses",
      ["sku", "description", "status", "batch_id", "synced_at"],
      rows.map((row) => [
        row.sku,
        row.description,
        row.status,
        row.batch_id,
        row.synced_at,
      ]),
      "ON CONFLICT(batch_id,sku) DO NOTHING",
    );
    summary.winthor_statuses = rows.length;
  }

  if (await exists(source, "image_sync_jobs")) {
    const rows = (
      await source.query("SELECT * FROM image_sync_jobs ORDER BY id")
    ).rows;
    await insertMany(
      target,
      "image_sync_jobs",
      [
        "batch_id",
        "sku",
        "image_position",
        "file_name",
        "mime_type",
        "status",
        "attempts",
        "lease_until",
        "last_error",
        "created_at",
        "completed_at",
      ],
      rows.map((row) => [
        row.batch_id,
        row.sku,
        row.image_position,
        row.file_name,
        row.mime_type,
        row.status,
        row.attempts,
        row.lease_until,
        row.last_error,
        row.created_at,
        row.completed_at,
      ]),
    );
    await target.query(
      `DELETE FROM image_sync_jobs newer USING image_sync_jobs older
       WHERE newer.id > older.id AND newer.batch_id=older.batch_id
         AND newer.sku=older.sku AND newer.image_position=older.image_position
         AND newer.file_name=older.file_name AND newer.created_at=older.created_at`,
    );
    summary.image_sync_jobs = rows.length;
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
