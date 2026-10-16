import pg from "pg";
import { createGzip } from "node:zlib";
import { createWriteStream } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { once } from "node:events";
import path from "node:path";

const { Client } = pg;
const connectionString = String(
  process.env.DIRECT_URL || process.env.DATABASE_URL || "",
).trim();
if (!connectionString) throw new Error("Defina DIRECT_URL ou DATABASE_URL.");

const tables = [
  "users",
  "sessions",
  "login_attempts",
  "reprocess_jobs",
  "app_settings",
  "product_overrides",
  "product_overrides_v2",
  "shopify_catalog_products",
  "shopify_catalog_sync_runs",
  "shopify_catalog_staging",
  "winthor_product_statuses",
  "winthor_sync_runs",
  "image_sync_jobs",
];

const outputDirectory = path.resolve(
  process.env.BACKUP_DIRECTORY || path.join(process.cwd(), "backups"),
);
const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const outputPath = path.join(outputDirectory, `prisma-postgres-${stamp}.jsonl.gz`);
const client = new Client({ connectionString });

function serialize(value) {
  return JSON.stringify(value, (_key, item) =>
    typeof item === "bigint" ? item.toString() : item,
  );
}

await mkdir(outputDirectory, { recursive: true });
await client.connect();
const gzip = createGzip({ level: 9 });
const output = createWriteStream(outputPath, { flags: "wx" });
gzip.pipe(output);

async function write(record) {
  if (!gzip.write(`${serialize(record)}\n`)) await once(gzip, "drain");
}

try {
  await write({ format: "pitter-pan-postgres-jsonl", version: 1, createdAt: new Date() });
  for (const table of tables) {
    const result = await client.query(`SELECT * FROM ${table}`);
    await write({ table, count: result.rowCount });
    for (const row of result.rows) await write({ table, row });
    console.log(`${table}: ${result.rowCount}`);
  }
  gzip.end();
  await once(output, "finish");
} finally {
  await client.end();
}

const digest = createHash("sha256")
  .update(await readFile(outputPath))
  .digest("hex")
  .toUpperCase();
console.log(`Backup: ${outputPath}`);
console.log(`SHA256: ${digest}`);
