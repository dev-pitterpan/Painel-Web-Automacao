import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const { Client } = pg;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const connectionString = String(
  process.env.DIRECT_URL || process.env.DATABASE_URL || "",
).trim();
if (!connectionString) throw new Error("Defina DIRECT_URL ou DATABASE_URL.");

const schema = await readFile(
  path.join(root, "database", "schema.sql"),
  "utf8",
);
const client = new Client({ connectionString });
await client.connect();
try {
  await client.query(schema);
  const { rows } = await client.query(
    "SELECT COUNT(*)::int AS tables FROM information_schema.tables WHERE table_schema = 'public'",
  );
  console.log(`Schema preparado: ${rows[0]?.tables || 0} tabela(s).`);
} finally {
  await client.end();
}
