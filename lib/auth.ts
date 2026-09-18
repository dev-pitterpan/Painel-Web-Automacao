import Database from "better-sqlite3";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: string;
};

export type ReprocessRecord = {
  result: Record<string, unknown> | null;
  id: number;
  requestId: string;
  sku: string;
  title: string;
  historicalDate: string | null;
  requestedBy: string;
  status: "enviado";
  createdAt: string;
};

type UserRecord = AuthUser & { password_hash: string };

const databasePath = process.env.AUTH_DATABASE_FILE || path.join(process.cwd(), "data", "auth.db");
mkdirSync(path.dirname(databasePath), { recursive: true });

const globalForAuth = globalThis as typeof globalThis & { authDatabase?: Database.Database };
const database = globalForAuth.authDatabase || new Database(databasePath);

database.pragma("journal_mode = WAL");
database.pragma("foreign_keys = ON");
database.pragma("busy_timeout = 5000");
database.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS login_attempts (
    identifier TEXT PRIMARY KEY,
    failures INTEGER NOT NULL DEFAULT 0,
    blocked_until INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS reprocess_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT NOT NULL UNIQUE,
    sku TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    historical_date TEXT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'enviado',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const reprocessColumns = database.prepare("PRAGMA table_info(reprocess_jobs)").all() as Array<{ name: string }>;
if (!reprocessColumns.some(column => column.name === "result_json")) {
  database.exec("ALTER TABLE reprocess_jobs ADD COLUMN result_json TEXT");
}

if (process.env.NODE_ENV !== "production") globalForAuth.authDatabase = database;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeIdentifier(identifier: string) {
  return identifier.trim().slice(0, 160).toLowerCase() || "unknown";
}

function isValidEmail(email: string) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash: string) {
  const [salt, expected] = storedHash.split(":");
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function toUser(record: UserRecord | undefined): AuthUser | null {
  if (!record) return null;
  return { id: record.id, name: record.name, email: record.email, role: record.role };
}

export function createUser(name: string, email: string, password: string, role = "user") {
  if (name.trim().length < 2 || name.trim().length > 100) throw new Error("O nome precisa ter entre 2 e 100 caracteres.");
  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) throw new Error("E-mail inválido.");
  if (password.length < 12 || password.length > 256) throw new Error("A senha precisa ter entre 12 e 256 caracteres.");
  if (!/^(user|admin)$/.test(role)) throw new Error("Perfil de usuário inválido.");
  const result = database.prepare(
    "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)"
  ).run(name.trim(), normalizedEmail, hashPassword(password), role);
  return Number(result.lastInsertRowid);
}

export function seedAdminFromEnvironment() {
  const email = process.env.AUTH_ADMIN_EMAIL;
  const password = process.env.AUTH_ADMIN_PASSWORD;
  if (!email || !password) return;
  const existing = database.prepare("SELECT id FROM users WHERE email = ?").get(normalizeEmail(email));
  if (!existing) createUser(process.env.AUTH_ADMIN_NAME || "Administrador", email, password, "admin");
}

export function authenticate(email: string, password: string) {
  const record = database.prepare("SELECT * FROM users WHERE email = ?").get(normalizeEmail(email)) as UserRecord | undefined;
  if (!record || !verifyPassword(password, record.password_hash)) return null;
  return toUser(record);
}

export function isLoginRateLimited(identifier: string) {
  const record = database.prepare("SELECT blocked_until FROM login_attempts WHERE identifier = ?").get(normalizeIdentifier(identifier)) as { blocked_until: number } | undefined;
  return Boolean(record && record.blocked_until > Date.now());
}

export function recordLoginFailure(identifier: string) {
  const key = normalizeIdentifier(identifier);
  const now = Date.now();
  const record = database.prepare("SELECT failures FROM login_attempts WHERE identifier = ?").get(key) as { failures: number } | undefined;
  const failures = (record?.failures || 0) + 1;
  const blockedUntil = failures >= 5 ? now + 15 * 60 * 1000 : 0;
  database.prepare(`
    INSERT INTO login_attempts (identifier, failures, blocked_until, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(identifier) DO UPDATE SET failures = excluded.failures, blocked_until = excluded.blocked_until, updated_at = excluded.updated_at
  `).run(key, failures, blockedUntil, now);
}

export function clearLoginFailures(identifier: string) {
  database.prepare("DELETE FROM login_attempts WHERE identifier = ?").run(normalizeIdentifier(identifier));
}

export function createSession(userId: number) {
  database.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + 1000 * 60 * 60 * 12;
  database.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(hashSessionToken(token), userId, expiresAt);
  return { token, expiresAt };
}

export function getUserBySession(token: string | undefined) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const record = database.prepare(`
    SELECT users.* FROM users
    INNER JOIN sessions ON sessions.user_id = users.id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).get(hashSessionToken(token), Date.now()) as UserRecord | undefined;
  return toUser(record);
}

export function getUserIdByEmail(email: string) {
  const record = database.prepare("SELECT id FROM users WHERE email = ?").get(normalizeEmail(email)) as { id: number } | undefined;
  return record?.id ?? null;
}

export function deleteSession(token: string | undefined) {
  if (token) database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashSessionToken(token));
}

export function recordPendingReprocess(record: { requestId: string; sku: string; title: string; historicalDate?: string | null; userId: number }) {
  database.prepare(`
    INSERT INTO reprocess_jobs (request_id, sku, title, historical_date, user_id, status, result_json)
    VALUES (?, ?, ?, ?, ?, 'processando', NULL)
  `).run(record.requestId, record.sku, record.title, record.historicalDate || null, record.userId);
}

export function recordReprocess(record: { requestId: string; sku: string; title: string; historicalDate?: string | null; userId: number; result?: unknown }) {
  database.prepare(`
    INSERT INTO reprocess_jobs (request_id, sku, title, historical_date, user_id, status, result_json)
    VALUES (?, ?, ?, ?, ?, 'enviado', ?)
  `).run(record.requestId, record.sku, record.title, record.historicalDate || null, record.userId, JSON.stringify(record.result || null));
}

export function completeReprocess(requestId: string, result: unknown) {
  const update = database.prepare(`
    UPDATE reprocess_jobs
    SET status = 'enviado', result_json = ?
    WHERE request_id = ? AND status = 'processando'
  `).run(JSON.stringify(result), requestId);
  return update.changes > 0;
}

export function getReprocessStatus(user: AuthUser, requestId: string) {
  const row = database.prepare(`
    SELECT request_id, sku, title, status, result_json
    FROM reprocess_jobs
    WHERE request_id = ? AND (user_id = ? OR ? = 'admin')
  `).get(requestId, user.id, user.role) as {
    request_id: string; sku: string; title: string; status: string; result_json: string | null;
  } | undefined;
  if (!row) return null;
  return {
    requestId: row.request_id,
    sku: row.sku,
    title: row.title,
    completed: row.status === 'enviado' && Boolean(row.result_json),
    result: row.result_json ? JSON.parse(row.result_json) as Record<string, unknown> : null
  };
}

export function isCompleteReprocessResult(payload: unknown) {
  const result = Array.isArray(payload) ? payload[0] as Record<string, unknown> | undefined : payload as Record<string, unknown> | null;
  if (!result || typeof result !== "object") return false;

  // O callback só é chamado pelo n8n no final da automação. Alguns fluxos
  // não devolvem o campo `processado`, por isso a conclusão também é aceita
  // quando há dados finais do produto.
  const processed = result.processado === true || String(result.processado || "").toLowerCase() === "true";
  const explicitlyPending = result.processado === false || ["false", "não", "nao", "pendente", "processando"].includes(String(result.processado || result.status || "").toLowerCase());
  const hasFinalProductData = ["tags_depois", "titulo_depois", "colecoes_depois", "status"].some(field => Object.prototype.hasOwnProperty.call(result, field));
  return Boolean(!explicitlyPending && (processed || hasFinalProductData));
}

export function listReprocesses(user: AuthUser): ReprocessRecord[] {
  const rows = database.prepare(`
    SELECT reprocess_jobs.id, reprocess_jobs.request_id, reprocess_jobs.sku,
      reprocess_jobs.title, reprocess_jobs.historical_date, reprocess_jobs.status,
      reprocess_jobs.created_at, users.name AS requested_by, reprocess_jobs.result_json
    FROM reprocess_jobs
    INNER JOIN users ON users.id = reprocess_jobs.user_id
    WHERE reprocess_jobs.status = 'enviado' AND reprocess_jobs.result_json IS NOT NULL
    ${user.role === "admin" ? "" : "AND reprocess_jobs.user_id = ?"}
    ORDER BY reprocess_jobs.id DESC
    LIMIT 500
  `).all(...(user.role === "admin" ? [] : [user.id])) as Array<{
    id: number; request_id: string; sku: string; title: string; historical_date: string | null;
    status: "enviado"; created_at: string; requested_by: string; result_json: string | null;
  }>;
  return rows.map(row => ({
    id: row.id,
    requestId: row.request_id,
    sku: row.sku,
    title: row.title,
    historicalDate: row.historical_date,
    requestedBy: row.requested_by,
    status: row.status,
    createdAt: row.created_at,
    result: row.result_json ? JSON.parse(row.result_json) as Record<string, unknown> : null
  }));
}

export async function getCurrentUser() {
  const { cookies } = await import("next/headers");
  const token = (await cookies()).get("pitter_session")?.value;
  return getUserBySession(token);
}

export async function getAuthenticatedUser() {
  return getCurrentUser();
}

seedAdminFromEnvironment();
