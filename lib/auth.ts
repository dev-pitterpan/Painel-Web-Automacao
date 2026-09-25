import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export type AuthUser = { id: number; name: string; email: string; role: string };
export type ManagedUser = AuthUser & { createdAt: string };
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
const DEFAULT_SETTINGS: AppSettings = {
  manualSecondsPerProduct: 60,
  batchSize: 5,
  batchSeconds: 40,
  qualityTarget: 95,
  staleSyncMinutes: 30,
};

const globalForDb = globalThis as typeof globalThis & {
  databaseReady?: Promise<void>;
  neonSql?: ReturnType<typeof neon>;
};

function getSql() {
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) throw new Error("DATABASE_URL não foi configurada.");
  if (!globalForDb.neonSql) globalForDb.neonSql = neon(databaseUrl);
  return globalForDb.neonSql;
}

async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
  return await getSql().query(text, params as never[]) as T[];
}

async function ensureDatabase() {
  if (!globalForDb.databaseReady) {
    globalForDb.databaseReady = (async () => {
      const schema = [
        `CREATE TABLE IF NOT EXISTS users (
          id BIGSERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY,
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at BIGINT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS login_attempts (
          identifier TEXT PRIMARY KEY,
          failures INTEGER NOT NULL DEFAULT 0,
          blocked_until BIGINT NOT NULL DEFAULT 0,
          updated_at BIGINT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS reprocess_jobs (
          id BIGSERIAL PRIMARY KEY,
          request_id TEXT NOT NULL UNIQUE,
          sku TEXT NOT NULL,
          title TEXT NOT NULL DEFAULT '',
          historical_date TEXT,
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'enviado',
          result_json JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS audit_logs (
          id BIGSERIAL PRIMARY KEY,
          user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
          action TEXT NOT NULL,
          entity TEXT NOT NULL,
          details_json JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
        "CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC)",
      ];
      for (const statement of schema) await query(statement);

      const email = process.env.AUTH_ADMIN_EMAIL;
      const password = process.env.AUTH_ADMIN_PASSWORD;
      if (email && password) {
        const [{ total }] = await query<{ total: string }>("SELECT COUNT(*)::text AS total FROM users");
        if (Number(total) === 0) {
          await query(
            "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'admin')",
            [process.env.AUTH_ADMIN_NAME || "Administrador", normalizeEmail(email), hashPassword(password)],
          );
        }
      }
    })().catch(error => {
      globalForDb.databaseReady = undefined;
      throw error;
    });
  }
  await globalForDb.databaseReady;
}

function normalizeEmail(email: string) { return email.trim().toLowerCase(); }
function normalizeIdentifier(identifier: string) { return identifier.trim().slice(0, 160).toLowerCase() || "unknown"; }
function isValidEmail(email: string) { return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
function verifyPassword(password: string, storedHash: string) {
  const [salt, expected] = storedHash.split(":");
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}
function hashSessionToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
function toUser(record: UserRecord | undefined): AuthUser | null {
  return record ? { id: Number(record.id), name: record.name, email: record.email, role: record.role } : null;
}
function iso(value: unknown) { return value instanceof Date ? value.toISOString() : String(value || ""); }
function jsonObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "string") {
    try { return JSON.parse(value) as Record<string, unknown>; } catch { return null; }
  }
  return typeof value === "object" ? value as Record<string, unknown> : null;
}

export async function getAppSettings(): Promise<AppSettings> {
  await ensureDatabase();
  const entries = await query<{ key: string; value: string }>("SELECT key, value FROM app_settings");
  const stored = Object.fromEntries(entries.map(item => [item.key, Number(item.value)]));
  return {
    manualSecondsPerProduct: stored.manualSecondsPerProduct || DEFAULT_SETTINGS.manualSecondsPerProduct,
    batchSize: stored.batchSize || DEFAULT_SETTINGS.batchSize,
    batchSeconds: stored.batchSeconds || DEFAULT_SETTINGS.batchSeconds,
    qualityTarget: stored.qualityTarget || DEFAULT_SETTINGS.qualityTarget,
    staleSyncMinutes: stored.staleSyncMinutes || DEFAULT_SETTINGS.staleSyncMinutes,
  };
}

export async function updateAppSettings(actor: AuthUser, input: Partial<AppSettings>) {
  if (actor.role !== "admin") throw new Error("Apenas administradores podem alterar as configurações.");
  const current = await getAppSettings();
  const next: AppSettings = {
    manualSecondsPerProduct: Math.min(3600, Math.max(1, Math.round(Number(input.manualSecondsPerProduct ?? current.manualSecondsPerProduct)))),
    batchSize: Math.min(100, Math.max(1, Math.round(Number(input.batchSize ?? current.batchSize)))),
    batchSeconds: Math.min(3600, Math.max(1, Math.round(Number(input.batchSeconds ?? current.batchSeconds)))),
    qualityTarget: Math.min(100, Math.max(1, Math.round(Number(input.qualityTarget ?? current.qualityTarget)))),
    staleSyncMinutes: Math.min(1440, Math.max(1, Math.round(Number(input.staleSyncMinutes ?? current.staleSyncMinutes)))),
  };
  await Promise.all(Object.entries(next).map(([key, value]) => query(
    "INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()",
    [key, String(value)],
  )));
  await recordAudit({ userId: actor.id, action: "settings_updated", entity: "settings", details: next });
  return next;
}

export async function createUser(name: string, email: string, password: string, role = "user") {
  if (name.trim().length < 2 || name.trim().length > 100) throw new Error("O nome precisa ter entre 2 e 100 caracteres.");
  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) throw new Error("E-mail inválido.");
  if (password.length < 12 || password.length > 256) throw new Error("A senha precisa ter entre 12 e 256 caracteres.");
  if (!/^(user|admin)$/.test(role)) throw new Error("Perfil de usuário inválido.");
  await ensureDatabase();
  const [row] = await query<{ id: number }>(
    "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id",
    [name.trim(), normalizedEmail, hashPassword(password), role],
  );
  return Number(row.id);
}

export async function listUsers(): Promise<ManagedUser[]> {
  await ensureDatabase();
  const rows = await query<{ id: number; name: string; email: string; role: string; created_at: unknown }>("SELECT id, name, email, role, created_at FROM users ORDER BY id");
  return rows.map(row => ({ id: Number(row.id), name: row.name, email: row.email, role: row.role, createdAt: iso(row.created_at) }));
}

export async function updateManagedUser(actor: AuthUser, userId: number, input: { name?: string; email?: string; role?: "user" | "admin"; password?: string }) {
  if (actor.role !== "admin") throw new Error("Apenas administradores podem editar usuários.");
  await ensureDatabase();
  const [target] = await query<AuthUser>("SELECT id, name, email, role FROM users WHERE id = $1", [userId]);
  if (!target) throw new Error("Usuário não encontrado.");
  const name = input.name === undefined ? target.name : String(input.name).trim();
  const email = input.email === undefined ? target.email : normalizeEmail(String(input.email));
  const role = input.role || target.role as "user" | "admin";
  const password = String(input.password || "");
  if (name.length < 2 || name.length > 100) throw new Error("O nome precisa ter entre 2 e 100 caracteres.");
  if (!isValidEmail(email)) throw new Error("E-mail inválido.");
  if (!/^(user|admin)$/.test(role)) throw new Error("Perfil de usuário inválido.");
  if (password && (password.length < 12 || password.length > 256)) throw new Error("A nova senha precisa ter entre 12 e 256 caracteres.");
  if (actor.id === userId && role !== "admin") throw new Error("A conta administrativa atual não pode remover o próprio acesso.");
  if (target.role === "admin" && role !== "admin") {
    const [{ total }] = await query<{ total: string }>("SELECT COUNT(*)::text AS total FROM users WHERE role = 'admin'");
    if (Number(total) <= 1) throw new Error("O sistema precisa manter pelo menos um administrador.");
  }
  const [duplicate] = await query<{ id: number }>("SELECT id FROM users WHERE email = $1 AND id <> $2", [email, userId]);
  if (duplicate) throw new Error("Já existe um usuário com este e-mail.");
  if (password) await query("UPDATE users SET name = $1, email = $2, role = $3, password_hash = $4 WHERE id = $5", [name, email, role, hashPassword(password), userId]);
  else await query("UPDATE users SET name = $1, email = $2, role = $3 WHERE id = $4", [name, email, role, userId]);
  await recordAudit({ userId: actor.id, action: "user_updated", entity: "user", details: { targetUserId: userId, previousName: target.name, name, previousEmail: target.email, email, previousRole: target.role, role, passwordChanged: Boolean(password) } });
}

export async function updateOwnProfile(actor: AuthUser, input: { name: string; email: string; currentPassword: string; newPassword?: string }) {
  await ensureDatabase();
  const [target] = await query<UserRecord>("SELECT id, name, email, role, password_hash FROM users WHERE id = $1", [actor.id]);
  if (!target) throw new Error("Usuário não encontrado.");

  const name = String(input.name || "").trim();
  const email = normalizeEmail(String(input.email || ""));
  const currentPassword = String(input.currentPassword || "");
  const newPassword = String(input.newPassword || "");

  if (name.length < 2 || name.length > 100) throw new Error("O nome precisa ter entre 2 e 100 caracteres.");
  if (!isValidEmail(email)) throw new Error("E-mail inválido.");
  if (!currentPassword || !verifyPassword(currentPassword, target.password_hash)) throw new Error("A senha atual está incorreta.");
  if (newPassword && (newPassword.length < 12 || newPassword.length > 256)) throw new Error("A nova senha precisa ter entre 12 e 256 caracteres.");

  const [duplicate] = await query<{ id: number }>("SELECT id FROM users WHERE email = $1 AND id <> $2", [email, actor.id]);
  if (duplicate) throw new Error("Já existe um usuário com este e-mail.");

  if (newPassword) {
    await query("UPDATE users SET name = $1, email = $2, password_hash = $3 WHERE id = $4", [name, email, hashPassword(newPassword), actor.id]);
  } else {
    await query("UPDATE users SET name = $1, email = $2 WHERE id = $3", [name, email, actor.id]);
  }

  await recordAudit({
    userId: actor.id,
    action: "profile_updated",
    entity: "user",
    details: {
      previousName: target.name,
      name,
      previousEmail: target.email,
      email,
      passwordChanged: Boolean(newPassword),
    },
  });

  return { id: actor.id, name, email, role: target.role } satisfies AuthUser;
}

export async function deleteManagedUser(actor: AuthUser, userId: number) {
  if (actor.role !== "admin") throw new Error("Apenas administradores podem excluir usuários.");
  if (actor.id === userId) throw new Error("Você não pode excluir a conta que está usando.");
  await ensureDatabase();
  const [target] = await query<AuthUser>("SELECT id, name, email, role FROM users WHERE id = $1", [userId]);
  if (!target) throw new Error("Usuário não encontrado.");
  if (target.role === "admin") {
    const [{ total }] = await query<{ total: string }>("SELECT COUNT(*)::text AS total FROM users WHERE role = 'admin'");
    if (Number(total) <= 1) throw new Error("O sistema precisa manter pelo menos um administrador.");
  }
  await query("DELETE FROM users WHERE id = $1", [userId]);
  await recordAudit({ userId: actor.id, action: "user_deleted", entity: "user", details: { targetUserId: userId, name: target.name, email: target.email, role: target.role } });
}

export async function recordAudit(entry: { userId?: number | null; action: string; entity: string; details?: Record<string, unknown> | null }) {
  await ensureDatabase();
  await query("INSERT INTO audit_logs (user_id, action, entity, details_json) VALUES ($1, $2, $3, $4::jsonb)", [entry.userId ?? null, entry.action.slice(0, 80), entry.entity.slice(0, 80), entry.details ? JSON.stringify(entry.details) : null]);
}

export async function listAuditLogs(limit = 500): Promise<AuditRecord[]> {
  await ensureDatabase();
  const rows = await query<{ id: number; action: string; entity: string; details_json: unknown; created_at: unknown; user_name: string | null; user_email: string | null }>(`
    SELECT audit_logs.id, audit_logs.action, audit_logs.entity, audit_logs.details_json,
      audit_logs.created_at, users.name AS user_name, users.email AS user_email
    FROM audit_logs LEFT JOIN users ON users.id = audit_logs.user_id
    ORDER BY audit_logs.id DESC LIMIT $1
  `, [Math.min(Math.max(limit, 1), 1000)]);
  return rows.map(row => ({ id: Number(row.id), action: row.action, entity: row.entity, details: jsonObject(row.details_json), createdAt: iso(row.created_at), userName: row.user_name, userEmail: row.user_email }));
}

export async function getN8nHealthSummary() {
  await ensureDatabase();
  const [jobs] = await query<{ total: string; pending: string; expired: string; last_response: unknown }>(`
    SELECT COUNT(*)::text AS total,
      COUNT(*) FILTER (WHERE status = 'processando' AND created_at >= NOW() - INTERVAL '30 minutes')::text AS pending,
      COUNT(*) FILTER (WHERE status = 'processando' AND created_at < NOW() - INTERVAL '30 minutes')::text AS expired,
      MAX(created_at) FILTER (WHERE status = 'enviado' AND result_json IS NOT NULL) AS last_response
    FROM reprocess_jobs
  `);
  const [lastFailure] = await query<{ created_at: unknown; details_json: unknown }>("SELECT created_at, details_json FROM audit_logs WHERE action = 'reprocess_failed' ORDER BY id DESC LIMIT 1");
  return {
    total: Number(jobs.total), pending: Number(jobs.pending), expired: Number(jobs.expired),
    lastResponse: jobs.last_response ? iso(jobs.last_response) : null,
    lastFailureAt: lastFailure ? iso(lastFailure.created_at) : null,
    lastFailure: lastFailure ? jsonObject(lastFailure.details_json) : null,
  };
}

export async function authenticate(email: string, password: string) {
  await ensureDatabase();
  const [record] = await query<UserRecord>("SELECT id, name, email, role, password_hash FROM users WHERE email = $1", [normalizeEmail(email)]);
  if (!record || !verifyPassword(password, record.password_hash)) return null;
  return toUser(record);
}

export async function isLoginRateLimited(identifier: string) {
  await ensureDatabase();
  const [record] = await query<{ blocked_until: string }>("SELECT blocked_until::text FROM login_attempts WHERE identifier = $1", [normalizeIdentifier(identifier)]);
  return Boolean(record && Number(record.blocked_until) > Date.now());
}

export async function recordLoginFailure(identifier: string) {
  await ensureDatabase();
  const key = normalizeIdentifier(identifier);
  const now = Date.now();
  const [record] = await query<{ failures: number }>("SELECT failures FROM login_attempts WHERE identifier = $1", [key]);
  const failures = Number(record?.failures || 0) + 1;
  const blockedUntil = failures >= 5 ? now + 15 * 60 * 1000 : 0;
  await query(`INSERT INTO login_attempts (identifier, failures, blocked_until, updated_at) VALUES ($1, $2, $3, $4)
    ON CONFLICT(identifier) DO UPDATE SET failures = EXCLUDED.failures, blocked_until = EXCLUDED.blocked_until, updated_at = EXCLUDED.updated_at`,
  [key, failures, blockedUntil, now]);
}

export async function clearLoginFailures(identifier: string) {
  await ensureDatabase();
  await query("DELETE FROM login_attempts WHERE identifier = $1", [normalizeIdentifier(identifier)]);
}

export async function createSession(userId: number) {
  await ensureDatabase();
  await query("DELETE FROM sessions WHERE expires_at <= $1", [Date.now()]);
  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + 1000 * 60 * 60 * 12;
  await query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [hashSessionToken(token), userId, expiresAt]);
  return { token, expiresAt };
}

export async function getUserBySession(token: string | undefined) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  await ensureDatabase();
  const [record] = await query<UserRecord>(`SELECT users.id, users.name, users.email, users.role, users.password_hash FROM users
    INNER JOIN sessions ON sessions.user_id = users.id
    WHERE sessions.token_hash = $1 AND sessions.expires_at > $2`, [hashSessionToken(token), Date.now()]);
  return toUser(record);
}

export async function getUserIdByEmail(email: string) {
  await ensureDatabase();
  const [record] = await query<{ id: number }>("SELECT id FROM users WHERE email = $1", [normalizeEmail(email)]);
  return record ? Number(record.id) : null;
}

export async function deleteSession(token: string | undefined) {
  if (!token) return;
  await ensureDatabase();
  await query("DELETE FROM sessions WHERE token_hash = $1", [hashSessionToken(token)]);
}

export async function recordPendingReprocess(record: { requestId: string; sku: string; title: string; historicalDate?: string | null; userId: number }) {
  await ensureDatabase();
  await query(`INSERT INTO reprocess_jobs (request_id, sku, title, historical_date, user_id, status, result_json)
    VALUES ($1, $2, $3, $4, $5, 'processando', NULL)`, [record.requestId, record.sku, record.title, record.historicalDate || null, record.userId]);
}

export async function recordReprocess(record: { requestId: string; sku: string; title: string; historicalDate?: string | null; userId: number; result?: unknown }) {
  await ensureDatabase();
  await query(`INSERT INTO reprocess_jobs (request_id, sku, title, historical_date, user_id, status, result_json)
    VALUES ($1, $2, $3, $4, $5, 'enviado', $6::jsonb)`, [record.requestId, record.sku, record.title, record.historicalDate || null, record.userId, JSON.stringify(record.result || null)]);
}

export async function completeReprocess(requestId: string, result: unknown) {
  await ensureDatabase();
  const rows = await query<{ id: number }>("UPDATE reprocess_jobs SET status = 'enviado', result_json = $1::jsonb WHERE request_id = $2 AND status = 'processando' RETURNING id", [JSON.stringify(result), requestId]);
  return rows.length > 0;
}

export async function getReprocessStatus(user: AuthUser, requestId: string) {
  await ensureDatabase();
  const [row] = await query<{ request_id: string; sku: string; title: string; status: string; result_json: unknown }>(`
    SELECT request_id, sku, title, status, result_json FROM reprocess_jobs
    WHERE request_id = $1 AND (user_id = $2 OR $3 = 'admin')`, [requestId, user.id, user.role]);
  if (!row) return null;
  return { requestId: row.request_id, sku: row.sku, title: row.title, completed: row.status === "enviado" && Boolean(row.result_json), result: jsonObject(row.result_json) };
}

export function isCompleteReprocessResult(payload: unknown) {
  const result = Array.isArray(payload) ? payload[0] as Record<string, unknown> | undefined : payload as Record<string, unknown> | null;
  if (!result || typeof result !== "object") return false;
  const processed = result.processado === true || String(result.processado || "").toLowerCase() === "true";
  const explicitlyPending = result.processado === false || ["false", "não", "nao", "pendente", "processando"].includes(String(result.processado || result.status || "").toLowerCase());
  const hasFinalProductData = ["tags_depois", "titulo_depois", "colecoes_depois", "status"].some(field => Object.prototype.hasOwnProperty.call(result, field));
  return Boolean(!explicitlyPending && (processed || hasFinalProductData));
}

export async function listReprocesses(user: AuthUser): Promise<ReprocessRecord[]> {
  await ensureDatabase();
  const params: unknown[] = [];
  const userFilter = user.role === "admin" ? "" : "AND reprocess_jobs.user_id = $1";
  if (user.role !== "admin") params.push(user.id);
  const rows = await query<{ id: number; request_id: string; sku: string; title: string; historical_date: string | null; status: "enviado"; created_at: unknown; requested_by: string; result_json: unknown }>(`
    SELECT reprocess_jobs.id, reprocess_jobs.request_id, reprocess_jobs.sku, reprocess_jobs.title,
      reprocess_jobs.historical_date, reprocess_jobs.status, reprocess_jobs.created_at,
      users.name AS requested_by, reprocess_jobs.result_json
    FROM reprocess_jobs INNER JOIN users ON users.id = reprocess_jobs.user_id
    WHERE reprocess_jobs.status = 'enviado' AND reprocess_jobs.result_json IS NOT NULL
    ${userFilter} ORDER BY reprocess_jobs.id DESC LIMIT 500`, params);
  return rows.map(row => ({ id: Number(row.id), requestId: row.request_id, sku: row.sku, title: row.title, historicalDate: row.historical_date, requestedBy: row.requested_by, status: row.status, createdAt: iso(row.created_at), result: jsonObject(row.result_json) }));
}

export async function getCurrentUser() {
  const { cookies } = await import("next/headers");
  const token = (await cookies()).get("pitter_session")?.value;
  return await getUserBySession(token);
}

export async function getAuthenticatedUser() { return await getCurrentUser(); }
