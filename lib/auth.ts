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

type UserRecord = AuthUser & { password_hash: string };

const databasePath = process.env.AUTH_DATABASE_FILE || path.join(process.cwd(), "data", "auth.db");
mkdirSync(path.dirname(databasePath), { recursive: true });

const globalForAuth = globalThis as typeof globalThis & { authDatabase?: Database.Database };
const database = globalForAuth.authDatabase || new Database(databasePath);

database.pragma("journal_mode = WAL");
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
`);

if (process.env.NODE_ENV !== "production") globalForAuth.authDatabase = database;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
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
  if (password.length < 8) throw new Error("A senha precisa ter pelo menos 8 caracteres.");
  const normalizedEmail = normalizeEmail(email);
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

export function createSession(userId: number) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + 1000 * 60 * 60 * 12;
  database.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(hashSessionToken(token), userId, expiresAt);
  return { token, expiresAt };
}

export function getUserBySession(token: string | undefined) {
  if (!token) return null;
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

export async function getCurrentUser() {
  const { cookies } = await import("next/headers");
  const token = (await cookies()).get("pitter_session")?.value;
  return getUserBySession(token);
}

seedAdminFromEnvironment();
