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

export type ManagedUser = AuthUser & { createdAt: string };
export type AppSettings = {
  manualSecondsPerProduct: number;
  batchSize: number;
  batchSeconds: number;
  qualityTarget: number;
  staleSyncMinutes: number;
};
export type AuditRecord = {
  id: number;
  action: string;
  entity: string;
  details: Record<string, unknown> | null;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
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
  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    details_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
`);

const DEFAULT_SETTINGS: AppSettings = {
  manualSecondsPerProduct: 60,
  batchSize: 5,
  batchSeconds: 40,
  qualityTarget: 95,
  staleSyncMinutes: 30,
};

export function getAppSettings(): AppSettings {
  const entries = database.prepare("SELECT key, value FROM app_settings").all() as Array<{ key: string; value: string }>;
  const stored = Object.fromEntries(entries.map(item => [item.key, Number(item.value)]));
  return {
    manualSecondsPerProduct: stored.manualSecondsPerProduct || DEFAULT_SETTINGS.manualSecondsPerProduct,
    batchSize: stored.batchSize || DEFAULT_SETTINGS.batchSize,
    batchSeconds: stored.batchSeconds || DEFAULT_SETTINGS.batchSeconds,
    qualityTarget: stored.qualityTarget || DEFAULT_SETTINGS.qualityTarget,
    staleSyncMinutes: stored.staleSyncMinutes || DEFAULT_SETTINGS.staleSyncMinutes,
  };
}

export function updateAppSettings(actor: AuthUser, input: Partial<AppSettings>) {
  if (actor.role !== "admin") throw new Error("Apenas administradores podem alterar as configurações.");
  const current = getAppSettings();
  const next: AppSettings = {
    manualSecondsPerProduct: Math.min(3600, Math.max(1, Math.round(Number(input.manualSecondsPerProduct ?? current.manualSecondsPerProduct)))),
    batchSize: Math.min(100, Math.max(1, Math.round(Number(input.batchSize ?? current.batchSize)))),
    batchSeconds: Math.min(3600, Math.max(1, Math.round(Number(input.batchSeconds ?? current.batchSeconds)))),
    qualityTarget: Math.min(100, Math.max(1, Math.round(Number(input.qualityTarget ?? current.qualityTarget)))),
    staleSyncMinutes: Math.min(1440, Math.max(1, Math.round(Number(input.staleSyncMinutes ?? current.staleSyncMinutes)))),
  };
  const statement = database.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`);
  const save = database.transaction(() => Object.entries(next).forEach(([key, value]) => statement.run(key, String(value))));
  save();
  recordAudit({ userId: actor.id, action: "settings_updated", entity: "settings", details: next });
  return next;
}

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
  const total = database.prepare("SELECT COUNT(*) AS total FROM users").get() as { total: number };
  if (total.total === 0) createUser(process.env.AUTH_ADMIN_NAME || "Administrador", email, password, "admin");
}

export function listUsers(): ManagedUser[] {
  return (database.prepare("SELECT id, name, email, role, created_at AS createdAt FROM users ORDER BY id").all() as ManagedUser[]);
}

export function updateUserRole(actor: AuthUser, userId: number, role: "user" | "admin") {
  if (actor.role !== "admin") throw new Error("Apenas administradores podem alterar perfis.");
  if (actor.id === userId && role !== "admin") throw new Error("A conta administrativa atual não pode remover o próprio acesso.");
  const target = database.prepare("SELECT id, name, email, role FROM users WHERE id = ?").get(userId) as AuthUser | undefined;
  if (!target) throw new Error("Usuário não encontrado.");
  database.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, userId);
  recordAudit({ userId: actor.id, action: "user_role_changed", entity: "user", details: { targetUserId: userId, targetEmail: target.email, previousRole: target.role, newRole: role } });
}

export function updateManagedUser(actor: AuthUser, userId: number, input: { name?: string; email?: string; role?: "user" | "admin"; password?: string }) {
  if (actor.role !== "admin") throw new Error("Apenas administradores podem editar usuários.");
  const target = database.prepare("SELECT id, name, email, role FROM users WHERE id = ?").get(userId) as AuthUser | undefined;
  if (!target) throw new Error("Usuário não encontrado.");

  const name = input.name === undefined ? target.name : String(input.name).trim();
  const email = input.email === undefined ? target.email : normalizeEmail(String(input.email));
  const role = input.role || (target.role as "user" | "admin");
  const password = String(input.password || "");
  if (name.length < 2 || name.length > 100) throw new Error("O nome precisa ter entre 2 e 100 caracteres.");
  if (!isValidEmail(email)) throw new Error("E-mail inválido.");
  if (!/^(user|admin)$/.test(role)) throw new Error("Perfil de usuário inválido.");
  if (password && (password.length < 12 || password.length > 256)) throw new Error("A nova senha precisa ter entre 12 e 256 caracteres.");
  if (actor.id === userId && role !== "admin") throw new Error("A conta administrativa atual não pode remover o próprio acesso.");
  if (target.role === "admin" && role !== "admin") {
    const admins = database.prepare("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'").get() as { total: number };
    if (admins.total <= 1) throw new Error("O sistema precisa manter pelo menos um administrador.");
  }

  const duplicate = database.prepare("SELECT id FROM users WHERE email = ? AND id <> ?").get(email, userId) as { id: number } | undefined;
  if (duplicate) throw new Error("Já existe um usuário com este e-mail.");
  if (password) database.prepare("UPDATE users SET name = ?, email = ?, role = ?, password_hash = ? WHERE id = ?").run(name, email, role, hashPassword(password), userId);
  else database.prepare("UPDATE users SET name = ?, email = ?, role = ? WHERE id = ?").run(name, email, role, userId);
  recordAudit({ userId: actor.id, action: "user_updated", entity: "user", details: { targetUserId: userId, previousName: target.name, name, previousEmail: target.email, email, previousRole: target.role, role, passwordChanged: Boolean(password) } });
}

export function deleteManagedUser(actor: AuthUser, userId: number) {
  if (actor.role !== "admin") throw new Error("Apenas administradores podem excluir usuários.");
  if (actor.id === userId) throw new Error("Você não pode excluir a conta que está usando.");
  const target = database.prepare("SELECT id, name, email, role FROM users WHERE id = ?").get(userId) as AuthUser | undefined;
  if (!target) throw new Error("Usuário não encontrado.");
  if (target.role === "admin") {
    const admins = database.prepare("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'").get() as { total: number };
    if (admins.total <= 1) throw new Error("O sistema precisa manter pelo menos um administrador.");
  }
  database.prepare("DELETE FROM users WHERE id = ?").run(userId);
  recordAudit({ userId: actor.id, action: "user_deleted", entity: "user", details: { targetUserId: userId, name: target.name, email: target.email, role: target.role } });
}

export function recordAudit(entry: { userId?: number | null; action: string; entity: string; details?: Record<string, unknown> | null }) {
  database.prepare("INSERT INTO audit_logs (user_id, action, entity, details_json) VALUES (?, ?, ?, ?)").run(entry.userId ?? null, entry.action.slice(0, 80), entry.entity.slice(0, 80), entry.details ? JSON.stringify(entry.details) : null);
}

export function listAuditLogs(limit = 500): AuditRecord[] {
  const rows = database.prepare(`
    SELECT audit_logs.id, audit_logs.action, audit_logs.entity, audit_logs.details_json,
      audit_logs.created_at AS createdAt, users.name AS userName, users.email AS userEmail
    FROM audit_logs LEFT JOIN users ON users.id = audit_logs.user_id
    ORDER BY audit_logs.id DESC LIMIT ?
  `).all(Math.min(Math.max(limit, 1), 1000)) as Array<Omit<AuditRecord, "details"> & { details_json: string | null }>;
  return rows.map(({ details_json, ...row }) => ({ ...row, details: details_json ? JSON.parse(details_json) as Record<string, unknown> : null }));
}

export function getN8nHealthSummary() {
  const jobs = database.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'processando' AND datetime(created_at) >= datetime('now', '-30 minutes') THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'processando' AND datetime(created_at) < datetime('now', '-30 minutes') THEN 1 ELSE 0 END) AS expired,
      MAX(CASE WHEN status = 'enviado' AND result_json IS NOT NULL THEN created_at END) AS lastResponse
    FROM reprocess_jobs
  `).get() as { total: number; pending: number | null; expired: number | null; lastResponse: string | null };
  const lastFailure = database.prepare(`
    SELECT created_at AS createdAt, details_json AS detailsJson
    FROM audit_logs WHERE action = 'reprocess_failed'
    ORDER BY id DESC LIMIT 1
  `).get() as { createdAt: string; detailsJson: string | null } | undefined;
  return {
    total: jobs.total,
    pending: jobs.pending || 0,
    expired: jobs.expired || 0,
    lastResponse: jobs.lastResponse ? `${jobs.lastResponse}Z` : null,
    lastFailureAt: lastFailure ? `${lastFailure.createdAt}Z` : null,
    lastFailure: lastFailure?.detailsJson ? JSON.parse(lastFailure.detailsJson) as Record<string, unknown> : null
  };
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
