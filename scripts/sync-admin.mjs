import { randomBytes, scryptSync } from "node:crypto";
import pg from "pg";

const { Client } = pg;
const connectionString = String(
  process.env.DIRECT_URL || process.env.DATABASE_URL || "",
).trim();
const email = String(process.env.AUTH_ADMIN_EMAIL || "")
  .trim()
  .toLowerCase();
const password = String(process.env.AUTH_ADMIN_PASSWORD || "");
const name = String(process.env.AUTH_ADMIN_NAME || "Administrador").trim();
if (!connectionString || !email || password.length < 12) {
  throw new Error(
    "Defina o banco, AUTH_ADMIN_EMAIL e AUTH_ADMIN_PASSWORD com pelo menos 12 caracteres.",
  );
}
const salt = randomBytes(16).toString("hex");
const passwordHash = `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
const client = new Client({ connectionString });
await client.connect();
try {
  await client.query(
    `INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,'admin')
     ON CONFLICT(email) DO UPDATE SET name=EXCLUDED.name,password_hash=EXCLUDED.password_hash,role='admin'`,
    [name, email, passwordHash],
  );
  console.log(
    "Administrador sincronizado com as credenciais protegidas do ambiente.",
  );
} finally {
  await client.end();
}
