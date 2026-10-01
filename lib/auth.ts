import { neon } from "@neondatabase/serverless";
import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  avatarUrl: string | null;
};
export type ManagedUser = AuthUser;
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
export type ProductOverride = {
  sku: string;
  sourceTitle: string;
  title: string;
  description: string;
  tags: string[];
  collections: string[];
  weight: number;
  weightUnit: "g" | "kg";
  updatedAt: string;
};
export type ShopifyCatalogProduct = {
  shopifyId: string;
  title: string;
  handle: string;
  status: string;
  vendor: string;
  productType: string;
  tags: string[];
  collections: string[];
  imageUrl: string;
  imageAlt: string;
  sku: string;
  variants: Array<{
    id: string;
    title: string;
    sku: string;
    price: string;
    inventoryQuantity: number;
  }>;
  totalInventory: number;
  priceMin: number;
  priceMax: number;
  shopifyUpdatedAt: string;
  syncedAt: string;
};

type UserRecord = Omit<AuthUser, "createdAt" | "avatarUrl"> & {
  password_hash: string;
  created_at: unknown;
  avatar_url: string | null;
};
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

async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
) {
  return (await getSql().query(text, params as never[])) as T[];
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
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT",
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
        `CREATE TABLE IF NOT EXISTS product_overrides (
          sku TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          collections_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          weight DOUBLE PRECISION NOT NULL DEFAULT 0,
          weight_unit TEXT NOT NULL DEFAULT 'g',
          updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS product_overrides_v2 (
          sku TEXT NOT NULL,
          source_title TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          collections_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          weight DOUBLE PRECISION NOT NULL DEFAULT 0,
          weight_unit TEXT NOT NULL DEFAULT 'g',
          updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (sku, source_title)
        )`,
        `CREATE TABLE IF NOT EXISTS shopify_catalog_products (
          shopify_id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          handle TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'DRAFT',
          vendor TEXT NOT NULL DEFAULT '',
          product_type TEXT NOT NULL DEFAULT '',
          tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          collections_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          image_url TEXT NOT NULL DEFAULT '',
          image_alt TEXT NOT NULL DEFAULT '',
          primary_sku TEXT NOT NULL DEFAULT '',
          variants_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          total_inventory INTEGER NOT NULL DEFAULT 0,
          price_min DOUBLE PRECISION NOT NULL DEFAULT 0,
          price_max DOUBLE PRECISION NOT NULL DEFAULT 0,
          shopify_updated_at TIMESTAMPTZ,
          synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS image_sync_jobs (
          id BIGSERIAL PRIMARY KEY,
          batch_id TEXT NOT NULL,
          sku TEXT NOT NULL,
          image_position INTEGER NOT NULL,
          file_name TEXT NOT NULL,
          mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
          image_base64 TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          attempts INTEGER NOT NULL DEFAULT 0,
          lease_until TIMESTAMPTZ,
          last_error TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          completed_at TIMESTAMPTZ,
          UNIQUE(batch_id, image_position)
        )`,
        "CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_image_sync_jobs_pending ON image_sync_jobs(status, lease_until, id)",
        "CREATE INDEX IF NOT EXISTS idx_shopify_catalog_title ON shopify_catalog_products(title)",
        "CREATE INDEX IF NOT EXISTS idx_shopify_catalog_sku ON shopify_catalog_products(primary_sku)",
        "CREATE INDEX IF NOT EXISTS idx_shopify_catalog_updated ON shopify_catalog_products(shopify_updated_at DESC)",
      ];
      for (const statement of schema) await query(statement);

      const email = process.env.AUTH_ADMIN_EMAIL;
      const password = process.env.AUTH_ADMIN_PASSWORD;
      if (email && password) {
        const [{ total }] = await query<{ total: string }>(
          "SELECT COUNT(*)::text AS total FROM users",
        );
        if (Number(total) === 0) {
          await query(
            "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'admin')",
            [
              process.env.AUTH_ADMIN_NAME || "Administrador",
              normalizeEmail(email),
              hashPassword(password),
            ],
          );
        }
      }
    })().catch((error) => {
      globalForDb.databaseReady = undefined;
      throw error;
    });
  }
  await globalForDb.databaseReady;
}

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
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
function verifyPassword(password: string, storedHash: string) {
  const [salt, expected] = storedHash.split(":");
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return (
    actual.length === expectedBuffer.length &&
    timingSafeEqual(actual, expectedBuffer)
  );
}
function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
function toUser(record: UserRecord | undefined): AuthUser | null {
  return record
    ? {
        id: Number(record.id),
        name: record.name,
        email: record.email,
        role: record.role,
        createdAt: iso(record.created_at),
        avatarUrl: record.avatar_url || null,
      }
    : null;
}
function iso(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value || "");
}
function jsonObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export async function getAppSettings(): Promise<AppSettings> {
  await ensureDatabase();
  const entries = await query<{ key: string; value: string }>(
    "SELECT key, value FROM app_settings",
  );
  const stored = Object.fromEntries(
    entries.map((item) => [item.key, Number(item.value)]),
  );
  return {
    manualSecondsPerProduct:
      stored.manualSecondsPerProduct ||
      DEFAULT_SETTINGS.manualSecondsPerProduct,
    batchSize: stored.batchSize || DEFAULT_SETTINGS.batchSize,
    batchSeconds: stored.batchSeconds || DEFAULT_SETTINGS.batchSeconds,
    qualityTarget: stored.qualityTarget || DEFAULT_SETTINGS.qualityTarget,
    staleSyncMinutes:
      stored.staleSyncMinutes || DEFAULT_SETTINGS.staleSyncMinutes,
  };
}

export async function updateAppSettings(
  actor: AuthUser,
  input: Partial<AppSettings>,
) {
  if (actor.role !== "admin")
    throw new Error("Apenas administradores podem alterar as configurações.");
  const current = await getAppSettings();
  const next: AppSettings = {
    manualSecondsPerProduct: Math.min(
      3600,
      Math.max(
        1,
        Math.round(
          Number(
            input.manualSecondsPerProduct ?? current.manualSecondsPerProduct,
          ),
        ),
      ),
    ),
    batchSize: Math.min(
      100,
      Math.max(1, Math.round(Number(input.batchSize ?? current.batchSize))),
    ),
    batchSeconds: Math.min(
      3600,
      Math.max(
        1,
        Math.round(Number(input.batchSeconds ?? current.batchSeconds)),
      ),
    ),
    qualityTarget: Math.min(
      100,
      Math.max(
        1,
        Math.round(Number(input.qualityTarget ?? current.qualityTarget)),
      ),
    ),
    staleSyncMinutes: Math.min(
      1440,
      Math.max(
        1,
        Math.round(Number(input.staleSyncMinutes ?? current.staleSyncMinutes)),
      ),
    ),
  };
  await Promise.all(
    Object.entries(next).map(([key, value]) =>
      query(
        "INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()",
        [key, String(value)],
      ),
    ),
  );
  await recordAudit({
    userId: actor.id,
    action: "settings_updated",
    entity: "settings",
    details: next,
  });
  return next;
}

export async function createUser(
  name: string,
  email: string,
  password: string,
  role = "user",
) {
  if (name.trim().length < 2 || name.trim().length > 100)
    throw new Error("O nome precisa ter entre 2 e 100 caracteres.");
  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) throw new Error("E-mail inválido.");
  if (password.length < 12 || password.length > 256)
    throw new Error("A senha precisa ter entre 12 e 256 caracteres.");
  if (!/^(user|admin)$/.test(role))
    throw new Error("Perfil de usuário inválido.");
  await ensureDatabase();
  const [row] = await query<{ id: number }>(
    "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id",
    [name.trim(), normalizedEmail, hashPassword(password), role],
  );
  return Number(row.id);
}

export async function listUsers(): Promise<ManagedUser[]> {
  await ensureDatabase();
  const rows = await query<{
    id: number;
    name: string;
    email: string;
    role: string;
    created_at: unknown;
    avatar_url: string | null;
  }>(
    "SELECT id, name, email, role, created_at, avatar_url FROM users ORDER BY id",
  );
  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    email: row.email,
    role: row.role,
    createdAt: iso(row.created_at),
    avatarUrl: row.avatar_url || null,
  }));
}

export async function updateManagedUser(
  actor: AuthUser,
  userId: number,
  input: {
    name?: string;
    email?: string;
    role?: "user" | "admin";
    password?: string;
  },
) {
  if (actor.role !== "admin")
    throw new Error("Apenas administradores podem editar usuários.");
  await ensureDatabase();
  const [target] = await query<AuthUser>(
    "SELECT id, name, email, role FROM users WHERE id = $1",
    [userId],
  );
  if (!target) throw new Error("Usuário não encontrado.");
  const name =
    input.name === undefined ? target.name : String(input.name).trim();
  const email =
    input.email === undefined
      ? target.email
      : normalizeEmail(String(input.email));
  const role = input.role || (target.role as "user" | "admin");
  const password = String(input.password || "");
  if (name.length < 2 || name.length > 100)
    throw new Error("O nome precisa ter entre 2 e 100 caracteres.");
  if (!isValidEmail(email)) throw new Error("E-mail inválido.");
  if (!/^(user|admin)$/.test(role))
    throw new Error("Perfil de usuário inválido.");
  if (password && (password.length < 12 || password.length > 256))
    throw new Error("A nova senha precisa ter entre 12 e 256 caracteres.");
  if (actor.id === userId && role !== "admin")
    throw new Error(
      "A conta administrativa atual não pode remover o próprio acesso.",
    );
  if (target.role === "admin" && role !== "admin") {
    const [{ total }] = await query<{ total: string }>(
      "SELECT COUNT(*)::text AS total FROM users WHERE role = 'admin'",
    );
    if (Number(total) <= 1)
      throw new Error("O sistema precisa manter pelo menos um administrador.");
  }
  const [duplicate] = await query<{ id: number }>(
    "SELECT id FROM users WHERE email = $1 AND id <> $2",
    [email, userId],
  );
  if (duplicate) throw new Error("Já existe um usuário com este e-mail.");
  if (password)
    await query(
      "UPDATE users SET name = $1, email = $2, role = $3, password_hash = $4 WHERE id = $5",
      [name, email, role, hashPassword(password), userId],
    );
  else
    await query(
      "UPDATE users SET name = $1, email = $2, role = $3 WHERE id = $4",
      [name, email, role, userId],
    );
  await recordAudit({
    userId: actor.id,
    action: "user_updated",
    entity: "user",
    details: {
      targetUserId: userId,
      previousName: target.name,
      name,
      previousEmail: target.email,
      email,
      previousRole: target.role,
      role,
      passwordChanged: Boolean(password),
    },
  });
}

export async function updateOwnProfile(
  actor: AuthUser,
  input: {
    name: string;
    email: string;
    currentPassword: string;
    newPassword?: string;
    avatarUrl?: string | null;
  },
) {
  await ensureDatabase();
  const [target] = await query<UserRecord>(
    "SELECT id, name, email, role, password_hash, created_at, avatar_url FROM users WHERE id = $1",
    [actor.id],
  );
  if (!target) throw new Error("Usuário não encontrado.");

  const name = String(input.name || "").trim();
  const email = normalizeEmail(String(input.email || ""));
  const currentPassword = String(input.currentPassword || "");
  const newPassword = String(input.newPassword || "");
  const avatarUrl =
    input.avatarUrl === null
      ? null
      : String(input.avatarUrl || target.avatar_url || "");

  if (name.length < 2 || name.length > 100)
    throw new Error("O nome precisa ter entre 2 e 100 caracteres.");
  if (!isValidEmail(email)) throw new Error("E-mail inválido.");
  if (
    !currentPassword ||
    !verifyPassword(currentPassword, target.password_hash)
  )
    throw new Error("A senha atual está incorreta.");
  if (newPassword && (newPassword.length < 12 || newPassword.length > 256))
    throw new Error("A nova senha precisa ter entre 12 e 256 caracteres.");
  if (
    avatarUrl &&
    (!/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(avatarUrl) ||
      avatarUrl.length > 700_000)
  )
    throw new Error("A foto de perfil é inválida ou muito grande.");

  const [duplicate] = await query<{ id: number }>(
    "SELECT id FROM users WHERE email = $1 AND id <> $2",
    [email, actor.id],
  );
  if (duplicate) throw new Error("Já existe um usuário com este e-mail.");

  if (newPassword) {
    await query(
      "UPDATE users SET name = $1, email = $2, password_hash = $3, avatar_url = $4 WHERE id = $5",
      [name, email, hashPassword(newPassword), avatarUrl || null, actor.id],
    );
  } else {
    await query(
      "UPDATE users SET name = $1, email = $2, avatar_url = $3 WHERE id = $4",
      [name, email, avatarUrl || null, actor.id],
    );
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

  return {
    id: actor.id,
    name,
    email,
    role: target.role,
    createdAt: iso(target.created_at),
    avatarUrl: avatarUrl || null,
  } satisfies AuthUser;
}

export async function deleteManagedUser(actor: AuthUser, userId: number) {
  if (actor.role !== "admin")
    throw new Error("Apenas administradores podem excluir usuários.");
  if (actor.id === userId)
    throw new Error("Você não pode excluir a conta que está usando.");
  await ensureDatabase();
  const [target] = await query<AuthUser>(
    "SELECT id, name, email, role FROM users WHERE id = $1",
    [userId],
  );
  if (!target) throw new Error("Usuário não encontrado.");
  if (target.role === "admin") {
    const [{ total }] = await query<{ total: string }>(
      "SELECT COUNT(*)::text AS total FROM users WHERE role = 'admin'",
    );
    if (Number(total) <= 1)
      throw new Error("O sistema precisa manter pelo menos um administrador.");
  }
  await query("DELETE FROM users WHERE id = $1", [userId]);
  await recordAudit({
    userId: actor.id,
    action: "user_deleted",
    entity: "user",
    details: {
      targetUserId: userId,
      name: target.name,
      email: target.email,
      role: target.role,
    },
  });
}

export async function recordAudit(entry: {
  userId?: number | null;
  action: string;
  entity: string;
  details?: Record<string, unknown> | null;
}) {
  await ensureDatabase();
  await query(
    "INSERT INTO audit_logs (user_id, action, entity, details_json) VALUES ($1, $2, $3, $4::jsonb)",
    [
      entry.userId ?? null,
      entry.action.slice(0, 80),
      entry.entity.slice(0, 80),
      entry.details ? JSON.stringify(entry.details) : null,
    ],
  );
}

export async function upsertProductOverride(
  actor: AuthUser,
  product: Omit<ProductOverride, "updatedAt">,
) {
  await ensureDatabase();
  const sku = product.sku.trim();
  const sourceTitles = [product.sourceTitle, product.title]
    .map(normalizeProductIdentityPart)
    .filter((value, index, values) => value && values.indexOf(value) === index);
  for (const sourceTitle of sourceTitles)
    await query(
      `INSERT INTO product_overrides_v2
    (sku, source_title, title, description, tags_json, collections_json, weight, weight_unit, updated_by, updated_at)
    VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, NOW())
    ON CONFLICT (sku, source_title) DO UPDATE SET
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      tags_json = EXCLUDED.tags_json,
      collections_json = EXCLUDED.collections_json,
      weight = EXCLUDED.weight,
      weight_unit = EXCLUDED.weight_unit,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()`,
      [
        sku,
        sourceTitle,
        product.title,
        product.description,
        JSON.stringify(product.tags),
        JSON.stringify(product.collections),
        product.weight,
        product.weightUnit,
        actor.id,
      ],
    );
}

function normalizeProductIdentityPart(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

export function productIdentityKey(sku: string, title: string) {
  return `${String(sku || "").trim()}::${normalizeProductIdentityPart(title)}`;
}

export async function getProductOverrides() {
  await ensureDatabase();
  const rows = await query<{
    sku: string;
    source_title: string;
    title: string;
    description: string;
    tags_json: unknown;
    collections_json: unknown;
    weight: number;
    weight_unit: string;
    updated_at: unknown;
  }>(
    "SELECT sku, source_title, title, description, tags_json, collections_json, weight, weight_unit, updated_at FROM product_overrides_v2",
  );
  return new Map(
    rows.map((row) => [
      productIdentityKey(row.sku, row.source_title),
      {
        sku: row.sku,
        sourceTitle: row.source_title,
        title: row.title,
        description: row.description,
        tags: Array.isArray(row.tags_json) ? row.tags_json.map(String) : [],
        collections: Array.isArray(row.collections_json)
          ? row.collections_json.map(String)
          : [],
        weight: Number(row.weight),
        weightUnit: row.weight_unit === "kg" ? ("kg" as const) : ("g" as const),
        updatedAt: iso(row.updated_at),
      },
    ]),
  );
}

function catalogProductFromRow(row: any): ShopifyCatalogProduct {
  const variants = Array.isArray(row.variants_json) ? row.variants_json : [];
  return {
    shopifyId: String(row.shopify_id || ""),
    title: String(row.title || ""),
    handle: String(row.handle || ""),
    status: String(row.status || "DRAFT"),
    vendor: String(row.vendor || ""),
    productType: String(row.product_type || ""),
    tags: Array.isArray(row.tags_json) ? row.tags_json.map(String) : [],
    collections: Array.isArray(row.collections_json)
      ? row.collections_json.map(String)
      : [],
    imageUrl: String(row.image_url || ""),
    imageAlt: String(row.image_alt || ""),
    sku: String(row.primary_sku || variants[0]?.sku || ""),
    variants,
    totalInventory: Number(row.total_inventory || 0),
    priceMin: Number(row.price_min || 0),
    priceMax: Number(row.price_max || 0),
    shopifyUpdatedAt: iso(row.shopify_updated_at),
    syncedAt: iso(row.synced_at),
  };
}

export async function listShopifyCatalogProducts(input: {
  query?: string;
  status?: string;
  vendor?: string;
  tag?: string;
  collection?: string;
  productType?: string;
  page?: number;
  perPage?: number;
  sort?: "updated" | "title" | "title_desc" | "inventory";
}) {
  await ensureDatabase();
  const page = Math.max(1, Math.trunc(input.page || 1));
  const perPage = Math.min(100, Math.max(10, Math.trunc(input.perPage || 50)));
  const search = String(input.query || "").trim();
  const status = String(input.status || "").trim().toUpperCase();
  const where: string[] = [];
  const params: unknown[] = [];
  if (search) {
    params.push(`%${search}%`);
    where.push(`(title ILIKE $${params.length} OR primary_sku ILIKE $${params.length} OR vendor ILIKE $${params.length} OR variants_json::text ILIKE $${params.length})`);
  }
  if (["ACTIVE", "DRAFT", "ARCHIVED"].includes(status)) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  const exactFilters: Array<[string, string]> = [
    ["vendor", String(input.vendor || "").trim()],
    ["product_type", String(input.productType || "").trim()],
  ];
  for (const [column, value] of exactFilters) {
    if (!value) continue;
    params.push(value);
    where.push(`${column} = $${params.length}`);
  }
  for (const [column, value] of [
    ["tags_json", String(input.tag || "").trim()],
    ["collections_json", String(input.collection || "").trim()],
  ]) {
    if (!value) continue;
    params.push(JSON.stringify([value]));
    where.push(`${column} @> $${params.length}::jsonb`);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const order =
    input.sort === "title"
      ? "title ASC"
      : input.sort === "title_desc"
        ? "title DESC"
      : input.sort === "inventory"
        ? "total_inventory DESC, title ASC"
        : "shopify_updated_at DESC NULLS LAST, title ASC";
  const countRows = await query<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM shopify_catalog_products ${clause}`,
    params,
  );
  const listParams = [...params, perPage, (page - 1) * perPage];
  const rows = await query<any>(
    `SELECT * FROM shopify_catalog_products ${clause}
     ORDER BY ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    listParams,
  );
  const total = Number(countRows[0]?.total || 0);
  return {
    products: rows.map(catalogProductFromRow),
    page,
    perPage,
    total,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

export async function getShopifyCatalogFacets() {
  await ensureDatabase();
  const [vendors, productTypes, statuses, tags, collections] = await Promise.all([
    query<{ value: string }>("SELECT DISTINCT vendor AS value FROM shopify_catalog_products WHERE vendor <> '' ORDER BY value"),
    query<{ value: string }>("SELECT DISTINCT product_type AS value FROM shopify_catalog_products WHERE product_type <> '' ORDER BY value"),
    query<{ value: string }>("SELECT DISTINCT status AS value FROM shopify_catalog_products WHERE status <> '' ORDER BY value"),
    query<{ value: string }>("SELECT DISTINCT jsonb_array_elements_text(tags_json) AS value FROM shopify_catalog_products ORDER BY value"),
    query<{ value: string }>("SELECT DISTINCT jsonb_array_elements_text(collections_json) AS value FROM shopify_catalog_products ORDER BY value"),
  ]);
  const values = (rows: Array<{ value: string }>) => rows.map((row) => String(row.value)).filter(Boolean);
  return { vendors: values(vendors), productTypes: values(productTypes), statuses: values(statuses), tags: values(tags), collections: values(collections) };
}

export async function upsertShopifyCatalogProducts(
  products: Omit<ShopifyCatalogProduct, "syncedAt">[],
) {
  await ensureDatabase();
  for (const product of products) {
    await query(
      `INSERT INTO shopify_catalog_products
       (shopify_id, title, handle, status, vendor, product_type, tags_json,
        collections_json, image_url, image_alt, primary_sku, variants_json,
        total_inventory, price_min, price_max, shopify_updated_at, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,NOW())
       ON CONFLICT (shopify_id) DO UPDATE SET
        title=EXCLUDED.title, handle=EXCLUDED.handle, status=EXCLUDED.status,
        vendor=EXCLUDED.vendor, product_type=EXCLUDED.product_type,
        tags_json=EXCLUDED.tags_json, collections_json=EXCLUDED.collections_json,
        image_url=EXCLUDED.image_url, image_alt=EXCLUDED.image_alt,
        primary_sku=EXCLUDED.primary_sku, variants_json=EXCLUDED.variants_json,
        total_inventory=EXCLUDED.total_inventory, price_min=EXCLUDED.price_min,
        price_max=EXCLUDED.price_max, shopify_updated_at=EXCLUDED.shopify_updated_at,
        synced_at=NOW()`,
      [
        product.shopifyId,
        product.title,
        product.handle,
        product.status,
        product.vendor,
        product.productType,
        JSON.stringify(product.tags),
        JSON.stringify(product.collections),
        product.imageUrl,
        product.imageAlt,
        product.sku,
        JSON.stringify(product.variants),
        product.totalInventory,
        product.priceMin,
        product.priceMax,
        product.shopifyUpdatedAt || null,
      ],
    );
  }
}

export async function deleteShopifyCatalogProduct(shopifyId: string) {
  await ensureDatabase();
  await query("DELETE FROM shopify_catalog_products WHERE shopify_id = $1", [
    shopifyId,
  ]);
}

export async function archiveShopifyCatalogProducts(shopifyIds: string[]) {
  await ensureDatabase();
  const ids = [...new Set(shopifyIds.map(String).filter(Boolean))].slice(0, 250);
  if (!ids.length) return;
  await query(
    `UPDATE shopify_catalog_products
     SET status = 'ARCHIVED', shopify_updated_at = NOW(), synced_at = NOW()
     WHERE shopify_id = ANY($1::text[])`,
    [ids],
  );
}

export async function deleteShopifyCatalogProducts(shopifyIds: string[]) {
  await ensureDatabase();
  const ids = [...new Set(shopifyIds.map(String).filter(Boolean))].slice(0, 250);
  if (!ids.length) return;
  await query(
    "DELETE FROM shopify_catalog_products WHERE shopify_id = ANY($1::text[])",
    [ids],
  );
}

export type ImageSyncInput = {
  source: string;
  position: number;
};

export async function enqueueProductImages(
  actor: AuthUser,
  batchId: string,
  sku: string,
  images: ImageSyncInput[],
) {
  await ensureDatabase();
  const safeSku = sku
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 100);
  if (!safeSku) throw new Error("SKU inválido para sincronização de imagens.");

  for (const image of images) {
    const match = String(image.source || "").match(
      /^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=]+)$/i,
    );
    if (!match) throw new Error("Imagem inválida para sincronização local.");
    const position = Math.min(99, Math.max(0, Math.trunc(image.position)));
    const fileName = `${safeSku}${position ? `-${position}` : ""}.jpg`;
    await query(
      `INSERT INTO image_sync_jobs
       (batch_id, sku, image_position, file_name, mime_type, image_base64, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       ON CONFLICT (batch_id, image_position) DO UPDATE SET
         file_name = EXCLUDED.file_name,
         mime_type = EXCLUDED.mime_type,
         image_base64 = EXCLUDED.image_base64,
         status = 'pending', attempts = 0, lease_until = NULL,
         last_error = NULL, completed_at = NULL`,
      [batchId, sku.trim(), position, fileName, match[1], match[2]],
    );
  }

  await recordAudit({
    userId: actor.id,
    action: "image_sync_queued",
    entity: "product",
    details: { batchId, sku: sku.trim(), images: images.length },
  });
}

export async function enqueueProductImageDeletions(
  actor: AuthUser,
  batchId: string,
  sku: string,
  positions: number[],
) {
  await ensureDatabase();
  const safeSku = sku
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 100);
  if (!safeSku) throw new Error("SKU inválido para exclusão de imagens.");

  for (const rawPosition of positions) {
    const position = Math.min(99, Math.max(0, Math.trunc(rawPosition)));
    const fileName = `${safeSku}${position ? `-${position}` : ""}.jpg`;
    await query(
      `INSERT INTO image_sync_jobs
       (batch_id, sku, image_position, file_name, mime_type, image_base64, status)
       VALUES ($1, $2, $3, $4, 'application/x-delete', 'DELETE', 'pending')
       ON CONFLICT (batch_id, image_position) DO UPDATE SET
         file_name = EXCLUDED.file_name,
         mime_type = EXCLUDED.mime_type,
         image_base64 = EXCLUDED.image_base64,
         status = 'pending', attempts = 0, lease_until = NULL,
         last_error = NULL, completed_at = NULL`,
      [`${batchId}:delete`, sku.trim(), position, fileName],
    );
  }

  await recordAudit({
    userId: actor.id,
    action: "image_sync_deletions_queued",
    entity: "product",
    details: { batchId, sku: sku.trim(), positions },
  });
}

export async function enqueueProductImageReorder(
  actor: AuthUser,
  batchId: string,
  sku: string,
  moves: Array<{ from: number; to: number }>,
) {
  await ensureDatabase();
  const safeSku = sku
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 100);
  if (!safeSku) throw new Error("SKU invǭlido para reordena��ǜo de imagens.");
  const files = moves.map(({ from, to }) => ({
    source: `${safeSku}${from ? `-${from}` : ""}.jpg`,
    destination: `${safeSku}${to ? `-${to}` : ""}.jpg`,
  }));
  await query(
    `INSERT INTO image_sync_jobs
     (batch_id, sku, image_position, file_name, mime_type, image_base64, status)
     VALUES ($1, $2, 0, $3, 'application/x-reorder', $4, 'pending')
     ON CONFLICT (batch_id, image_position) DO UPDATE SET
       file_name = EXCLUDED.file_name, mime_type = EXCLUDED.mime_type,
       image_base64 = EXCLUDED.image_base64, status = 'pending', attempts = 0,
       lease_until = NULL, last_error = NULL, completed_at = NULL`,
    [`${batchId}:reorder`, sku.trim(), `${safeSku}.jpg`, JSON.stringify(files)],
  );
  await recordAudit({
    userId: actor.id,
    action: "image_sync_reorder_queued",
    entity: "product",
    details: { batchId, sku: sku.trim(), moves },
  });
}

export async function claimImageSyncJobs(limit = 5) {
  await ensureDatabase();
  const rows = await query<{
    id: number;
    batch_id: string;
    sku: string;
    image_position: number;
    file_name: string;
    mime_type: string;
    image_base64: string;
    attempts: number;
  }>(
    `WITH selected AS (
       SELECT id FROM image_sync_jobs
       WHERE image_base64 IS NOT NULL
         AND attempts < 10
         AND (status IN ('pending', 'retry')
           OR (status = 'processing' AND lease_until < NOW()))
       ORDER BY id ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE image_sync_jobs AS jobs
     SET status = 'processing', attempts = jobs.attempts + 1,
       lease_until = NOW() + INTERVAL '5 minutes', last_error = NULL
     FROM selected
     WHERE jobs.id = selected.id
     RETURNING jobs.id, jobs.batch_id, jobs.sku, jobs.image_position,
       jobs.file_name, jobs.mime_type, jobs.image_base64, jobs.attempts`,
    [Math.min(20, Math.max(1, Math.trunc(limit)))],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    batchId: row.batch_id,
    sku: row.sku,
    position: Number(row.image_position),
    fileName: row.file_name,
    mimeType: row.mime_type,
    operation:
      row.mime_type === "application/x-delete"
        ? "delete"
        : row.mime_type === "application/x-reorder"
          ? "reorder"
          : "write",
    base64: row.image_base64,
    attempts: Number(row.attempts),
  }));
}

export async function completeImageSyncJob(
  id: number,
  success: boolean,
  error = "",
) {
  await ensureDatabase();
  if (success) {
    await query(
      `UPDATE image_sync_jobs SET status = 'completed', image_base64 = NULL,
       lease_until = NULL, last_error = NULL, completed_at = NOW() WHERE id = $1`,
      [id],
    );
    return;
  }
  await query(
    `UPDATE image_sync_jobs SET status = 'retry', lease_until = NULL,
     last_error = $2 WHERE id = $1`,
    [id, error.slice(0, 1000) || "Falha informada pelo sincronizador."],
  );
}

export async function listAuditLogs(limit = 500): Promise<AuditRecord[]> {
  await ensureDatabase();
  const rows = await query<{
    id: number;
    action: string;
    entity: string;
    details_json: unknown;
    created_at: unknown;
    user_name: string | null;
    user_email: string | null;
  }>(
    `
    SELECT audit_logs.id, audit_logs.action, audit_logs.entity, audit_logs.details_json,
      audit_logs.created_at, users.name AS user_name, users.email AS user_email
    FROM audit_logs LEFT JOIN users ON users.id = audit_logs.user_id
    ORDER BY audit_logs.id DESC LIMIT $1
  `,
    [Math.min(Math.max(limit, 1), 1000)],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    action: row.action,
    entity: row.entity,
    details: jsonObject(row.details_json),
    createdAt: iso(row.created_at),
    userName: row.user_name,
    userEmail: row.user_email,
  }));
}

export async function getN8nHealthSummary() {
  await ensureDatabase();
  const [jobs] = await query<{
    total: string;
    pending: string;
    expired: string;
    last_response: unknown;
  }>(`
    SELECT COUNT(*)::text AS total,
      COUNT(*) FILTER (WHERE status = 'processando' AND created_at >= NOW() - INTERVAL '30 minutes')::text AS pending,
      COUNT(*) FILTER (WHERE status = 'processando' AND created_at < NOW() - INTERVAL '30 minutes')::text AS expired,
      MAX(created_at) FILTER (WHERE status = 'enviado' AND result_json IS NOT NULL) AS last_response
    FROM reprocess_jobs
  `);
  const [lastFailure] = await query<{
    created_at: unknown;
    details_json: unknown;
  }>(
    "SELECT created_at, details_json FROM audit_logs WHERE action = 'reprocess_failed' ORDER BY id DESC LIMIT 1",
  );
  return {
    total: Number(jobs.total),
    pending: Number(jobs.pending),
    expired: Number(jobs.expired),
    lastResponse: jobs.last_response ? iso(jobs.last_response) : null,
    lastFailureAt: lastFailure ? iso(lastFailure.created_at) : null,
    lastFailure: lastFailure ? jsonObject(lastFailure.details_json) : null,
  };
}

export async function authenticate(email: string, password: string) {
  await ensureDatabase();
  const [record] = await query<UserRecord>(
    "SELECT id, name, email, role, password_hash, created_at, avatar_url FROM users WHERE email = $1",
    [normalizeEmail(email)],
  );
  if (!record || !verifyPassword(password, record.password_hash)) return null;
  return toUser(record);
}

export async function isLoginRateLimited(identifier: string) {
  await ensureDatabase();
  const [record] = await query<{ blocked_until: string }>(
    "SELECT blocked_until::text FROM login_attempts WHERE identifier = $1",
    [normalizeIdentifier(identifier)],
  );
  return Boolean(record && Number(record.blocked_until) > Date.now());
}

export async function recordLoginFailure(identifier: string) {
  await ensureDatabase();
  const key = normalizeIdentifier(identifier);
  const now = Date.now();
  const [record] = await query<{ failures: number }>(
    "SELECT failures FROM login_attempts WHERE identifier = $1",
    [key],
  );
  const failures = Number(record?.failures || 0) + 1;
  const blockedUntil = failures >= 5 ? now + 15 * 60 * 1000 : 0;
  await query(
    `INSERT INTO login_attempts (identifier, failures, blocked_until, updated_at) VALUES ($1, $2, $3, $4)
    ON CONFLICT(identifier) DO UPDATE SET failures = EXCLUDED.failures, blocked_until = EXCLUDED.blocked_until, updated_at = EXCLUDED.updated_at`,
    [key, failures, blockedUntil, now],
  );
}

export async function clearLoginFailures(identifier: string) {
  await ensureDatabase();
  await query("DELETE FROM login_attempts WHERE identifier = $1", [
    normalizeIdentifier(identifier),
  ]);
}

export async function createSession(userId: number) {
  await ensureDatabase();
  await query("DELETE FROM sessions WHERE expires_at <= $1", [Date.now()]);
  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + 1000 * 60 * 60 * 12;
  await query(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
    [hashSessionToken(token), userId, expiresAt],
  );
  return { token, expiresAt };
}

export async function getUserBySession(token: string | undefined) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  await ensureDatabase();
  const [record] = await query<UserRecord>(
    `SELECT users.id, users.name, users.email, users.role, users.password_hash, users.created_at, users.avatar_url FROM users
    INNER JOIN sessions ON sessions.user_id = users.id
    WHERE sessions.token_hash = $1 AND sessions.expires_at > $2`,
    [hashSessionToken(token), Date.now()],
  );
  return toUser(record);
}

export async function getUserIdByEmail(email: string) {
  await ensureDatabase();
  const [record] = await query<{ id: number }>(
    "SELECT id FROM users WHERE email = $1",
    [normalizeEmail(email)],
  );
  return record ? Number(record.id) : null;
}

export async function deleteSession(token: string | undefined) {
  if (!token) return;
  await ensureDatabase();
  await query("DELETE FROM sessions WHERE token_hash = $1", [
    hashSessionToken(token),
  ]);
}

export async function recordPendingReprocess(record: {
  requestId: string;
  sku: string;
  title: string;
  historicalDate?: string | null;
  userId: number;
}) {
  await ensureDatabase();
  await query(
    `INSERT INTO reprocess_jobs (request_id, sku, title, historical_date, user_id, status, result_json)
    VALUES ($1, $2, $3, $4, $5, 'processando', NULL)`,
    [
      record.requestId,
      record.sku,
      record.title,
      record.historicalDate || null,
      record.userId,
    ],
  );
}

export async function recordReprocess(record: {
  requestId: string;
  sku: string;
  title: string;
  historicalDate?: string | null;
  userId: number;
  result?: unknown;
}) {
  await ensureDatabase();
  await query(
    `INSERT INTO reprocess_jobs (request_id, sku, title, historical_date, user_id, status, result_json)
    VALUES ($1, $2, $3, $4, $5, 'enviado', $6::jsonb)`,
    [
      record.requestId,
      record.sku,
      record.title,
      record.historicalDate || null,
      record.userId,
      JSON.stringify(record.result || null),
    ],
  );
}

export async function completeReprocess(requestId: string, result: unknown) {
  await ensureDatabase();
  const rows = await query<{ id: number }>(
    "UPDATE reprocess_jobs SET status = 'enviado', result_json = $1::jsonb WHERE request_id = $2 AND status = 'processando' RETURNING id",
    [JSON.stringify(result), requestId],
  );
  return rows.length > 0;
}

export async function getReprocessStatus(user: AuthUser, requestId: string) {
  await ensureDatabase();
  const [row] = await query<{
    request_id: string;
    sku: string;
    title: string;
    status: string;
    result_json: unknown;
  }>(
    `
    SELECT request_id, sku, title, status, result_json FROM reprocess_jobs
    WHERE request_id = $1 AND (user_id = $2 OR $3 = 'admin')`,
    [requestId, user.id, user.role],
  );
  if (!row) return null;
  return {
    requestId: row.request_id,
    sku: row.sku,
    title: row.title,
    completed: row.status === "enviado" && Boolean(row.result_json),
    result: jsonObject(row.result_json),
  };
}

export function isCompleteReprocessResult(payload: unknown) {
  const result = Array.isArray(payload)
    ? (payload[0] as Record<string, unknown> | undefined)
    : (payload as Record<string, unknown> | null);
  if (!result || typeof result !== "object") return false;
  const processed =
    result.processado === true ||
    String(result.processado || "").toLowerCase() === "true";
  const explicitlyPending =
    result.processado === false ||
    ["false", "não", "nao", "pendente", "processando"].includes(
      String(result.processado || result.status || "").toLowerCase(),
    );
  const hasFinalProductData = [
    "tags_depois",
    "titulo_depois",
    "colecoes_depois",
    "status",
  ].some((field) => Object.prototype.hasOwnProperty.call(result, field));
  return Boolean(!explicitlyPending && (processed || hasFinalProductData));
}

export async function listReprocesses(
  user: AuthUser,
): Promise<ReprocessRecord[]> {
  await ensureDatabase();
  const params: unknown[] = [];
  const userFilter =
    user.role === "admin" ? "" : "AND reprocess_jobs.user_id = $1";
  if (user.role !== "admin") params.push(user.id);
  const rows = await query<{
    id: number;
    request_id: string;
    sku: string;
    title: string;
    historical_date: string | null;
    status: "enviado";
    created_at: unknown;
    requested_by: string;
    result_json: unknown;
  }>(
    `
    SELECT reprocess_jobs.id, reprocess_jobs.request_id, reprocess_jobs.sku, reprocess_jobs.title,
      reprocess_jobs.historical_date, reprocess_jobs.status, reprocess_jobs.created_at,
      users.name AS requested_by, reprocess_jobs.result_json
    FROM reprocess_jobs INNER JOIN users ON users.id = reprocess_jobs.user_id
    WHERE reprocess_jobs.status = 'enviado' AND reprocess_jobs.result_json IS NOT NULL
    ${userFilter} ORDER BY reprocess_jobs.id DESC LIMIT 500`,
    params,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    requestId: row.request_id,
    sku: row.sku,
    title: row.title,
    historicalDate: row.historical_date,
    requestedBy: row.requested_by,
    status: row.status,
    createdAt: iso(row.created_at),
    result: jsonObject(row.result_json),
  }));
}

export async function getCurrentUser() {
  const { cookies } = await import("next/headers");
  const token = (await cookies()).get("pitter_session")?.value;
  return await getUserBySession(token);
}

export async function getAuthenticatedUser() {
  return await getCurrentUser();
}
