import { client, defaultClientConfig, type Client } from "@prisma/ppg";
import { cache } from "react";
import { multipleSkuTerms } from "./search";
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
export type LatestReprocessResult = Pick<
  ReprocessRecord,
  "sku" | "title" | "createdAt" | "result"
>;
export type AppSettings = {
  manualSecondsPerProduct: number;
  batchSize: number;
  batchSeconds: number;
  qualityTarget: number;
  staleSyncMinutes: number;
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
  salesChannelsCount?: number;
  tags: string[];
  collections: string[];
  descriptionHtml: string;
  imageUrl: string;
  imageAlt: string;
  media: Array<{ id: string; url: string; alt: string }>;
  weight: number;
  weightUnit: "g" | "kg";
  sku: string;
  variants: Array<{
    id: string;
    title: string;
    sku: string;
    barcode: string;
    price: string;
    inventoryQuantity: number;
  }>;
  totalInventory: number;
  priceMin: number;
  priceMax: number;
  shopifyUpdatedAt: string;
  syncedAt: string;
  winthorStatus: "ATIVO" | "FORA_DE_LINHA" | "PENDENTE";
  winthorDescription: string;
  winthorSyncedAt: string;
};
export type WinthorStatusProduct = {
  sku: string;
  description: string;
};
export type ShopifyCatalogSyncProduct = Omit<
  ShopifyCatalogProduct,
  "syncedAt" | "winthorStatus" | "winthorDescription" | "winthorSyncedAt"
>;

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
  prismaPostgresClient?: Client;
};

function getDatabaseClient() {
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) throw new Error("DATABASE_URL não foi configurada.");
  if (!globalForDb.prismaPostgresClient) {
    globalForDb.prismaPostgresClient = client(defaultClientConfig(databaseUrl));
  }
  return globalForDb.prismaPostgresClient;
}

async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
) {
  const result = await getDatabaseClient().query(text, ...params);
  const rows = await result.rows.collect();
  return rows.map((row) =>
    Object.fromEntries(
      result.columns.map((column, index) => [column.name, row.values[index]]),
    ),
  ) as T[];
}

// O schema é aplicado explicitamente por npm run db:setup. Evita dezenas de
// operações DDL a cada nova instância serverless do Vercel.
async function ensureDatabase() {
  return;
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
    descriptionHtml: String(row.description_html || ""),
    imageUrl: String(row.image_url || ""),
    imageAlt: String(row.image_alt || ""),
    media: Array.isArray(row.media_json)
      ? row.media_json.map((item: any) => ({
          id: String(item?.id || ""),
          url: String(item?.url || ""),
          alt: String(item?.alt || ""),
        }))
      : [],
    weight: Number(row.weight || 0),
    weightUnit: row.weight_unit === "kg" ? "kg" : "g",
    sku: String(row.primary_sku || variants[0]?.sku || ""),
    variants,
    totalInventory: Number(row.total_inventory || 0),
    priceMin: Number(row.price_min || 0),
    priceMax: Number(row.price_max || 0),
    shopifyUpdatedAt: iso(row.shopify_updated_at),
    syncedAt: iso(row.synced_at),
    winthorStatus: ["ATIVO", "FORA_DE_LINHA"].includes(row.winthor_status)
      ? row.winthor_status
      : "PENDENTE",
    winthorDescription: String(row.winthor_description || ""),
    winthorSyncedAt: iso(row.winthor_synced_at),
  };
}

export async function listShopifyCatalogProducts(input: {
  query?: string;
  status?: string;
  vendor?: string;
  tag?: string;
  collection?: string;
  productType?: string;
  winthorStatus?: string;
  page?: number;
  perPage?: number;
  sort?: "updated" | "title" | "title_desc" | "inventory";
}) {
  await ensureDatabase();
  const page = Math.max(1, Math.trunc(input.page || 1));
  const perPage = Math.min(500, Math.max(10, Math.trunc(input.perPage || 50)));
  const search = String(input.query || "").trim();
  const skuTerms = multipleSkuTerms(search);
  const status = String(input.status || "")
    .trim()
    .toUpperCase();
  const where: string[] = [];
  const params: unknown[] = [];
  if (search) {
    if (skuTerms.length) {
      params.push(JSON.stringify(skuTerms));
      where.push(`(
        LOWER(TRIM(p.primary_sku)) IN (
          SELECT jsonb_array_elements_text($${params.length}::jsonb)
        )
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(p.variants_json) AS variant
          WHERE LOWER(TRIM(variant->>'sku')) IN (
            SELECT jsonb_array_elements_text($${params.length}::jsonb)
          )
        )
      )`);
    } else {
      params.push(`%${search}%`);
      where.push(
        `(p.title ILIKE $${params.length} OR p.primary_sku ILIKE $${params.length} OR p.vendor ILIKE $${params.length} OR p.variants_json::text ILIKE $${params.length})`,
      );
    }
  }
  if (["ACTIVE", "DRAFT", "ARCHIVED"].includes(status)) {
    params.push(status);
    where.push(`p.status = $${params.length}`);
  }
  const exactFilters: Array<[string, string]> = [
    ["p.vendor", String(input.vendor || "").trim()],
    ["p.product_type", String(input.productType || "").trim()],
  ];
  for (const [column, value] of exactFilters) {
    if (!value) continue;
    params.push(value);
    where.push(`${column} = $${params.length}`);
  }
  for (const [column, value] of [
    ["p.tags_json", String(input.tag || "").trim()],
    ["p.collections_json", String(input.collection || "").trim()],
  ]) {
    if (!value) continue;
    params.push(JSON.stringify([value]));
    where.push(`${column} @> $${params.length}::jsonb`);
  }
  const winthorStatus = String(input.winthorStatus || "")
    .trim()
    .toUpperCase();
  if (winthorStatus === "FORA_DE_LINHA") where.push("w.sku IS NOT NULL");
  if (winthorStatus === "ATIVO")
    where.push("w.sku IS NULL AND EXISTS (SELECT 1 FROM winthor_sync_runs)");
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const order =
    input.sort === "title"
      ? "p.title ASC, p.shopify_id ASC"
      : input.sort === "title_desc"
        ? "p.title DESC, p.shopify_id ASC"
        : input.sort === "inventory"
          ? "p.total_inventory DESC, p.title ASC, p.shopify_id ASC"
          : "LENGTH(p.shopify_id) DESC, p.shopify_id DESC";
  const listParams = [...params, perPage, (page - 1) * perPage];
  // Preserve each page's membership when a product is edited. Within that
  // stable page, show the most recently changed product first.
  const pageOrder =
    input.sort === "title"
      ? "ORDER BY page.title ASC, page.shopify_id ASC"
      : input.sort === "title_desc"
        ? "ORDER BY page.title DESC, page.shopify_id ASC"
        : input.sort === "inventory"
          ? "ORDER BY page.total_inventory DESC, page.title ASC, page.shopify_id ASC"
          : "ORDER BY page.shopify_updated_at DESC NULLS LAST, LENGTH(page.shopify_id) DESC, page.shopify_id DESC";
  const [countRows, rows] = await Promise.all([
    query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
     FROM shopify_catalog_products p
     LEFT JOIN winthor_product_statuses w
       ON w.sku = p.primary_sku
      AND w.batch_id = (
        SELECT batch_id FROM winthor_sync_runs ORDER BY created_at DESC LIMIT 1
      )
     ${clause}`,
      params,
    ),
    query<any>(
      `SELECT page.* FROM (SELECT p.shopify_id, p.title, p.handle, p.status, p.vendor,
       p.product_type, p.tags_json, p.collections_json, p.image_url,
       p.image_alt, p.weight, p.weight_unit, p.primary_sku,
       p.variants_json, p.total_inventory, p.price_min, p.price_max,
       p.shopify_updated_at, p.synced_at,
       CASE
         WHEN NOT EXISTS (SELECT 1 FROM winthor_sync_runs) THEN 'PENDENTE'
         WHEN w.sku IS NOT NULL THEN 'FORA_DE_LINHA'
         ELSE 'ATIVO'
       END AS winthor_status,
       COALESCE(w.description, '') AS winthor_description,
       w.synced_at AS winthor_synced_at
     FROM shopify_catalog_products p
     LEFT JOIN winthor_product_statuses w
       ON w.sku = p.primary_sku
      AND w.batch_id = (
        SELECT batch_id FROM winthor_sync_runs ORDER BY created_at DESC LIMIT 1
      )
     ${clause}
     ORDER BY ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}) page
     ${pageOrder}`,
      listParams,
    ),
  ]);
  const total = Number(countRows[0]?.total || 0);
  const products = rows.map(catalogProductFromRow);
  return {
    products,
    page,
    perPage,
    total,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

export async function getShopifyCatalogHealthSummary() {
  await ensureDatabase();
  const [catalog] = await query<{
    total: number;
    last_received_at: string | null;
    status: string | null;
    expected_count: number | null;
    received_count: number | null;
    completed_at: string | null;
    started_at: string | null;
    error_message: string | null;
  }>(
    `SELECT catalog.total, catalog.last_received_at,
       sync.status, sync.expected_count, sync.received_count,
       sync.completed_at, sync.started_at, sync.error_message
     FROM (
       SELECT COUNT(*)::int AS total, MAX(synced_at) AS last_received_at
       FROM shopify_catalog_products
     ) catalog
     LEFT JOIN LATERAL (
       SELECT status, expected_count, received_count, completed_at,
         started_at, error_message
       FROM shopify_catalog_sync_runs
       ORDER BY started_at DESC LIMIT 1
     ) sync ON true`,
  );
  const sync = catalog?.status ? catalog : null;
  return {
    productCount: Number(catalog?.total || 0),
    lastReceivedAt: catalog?.last_received_at
      ? iso(catalog.last_received_at)
      : null,
    latestSync: sync
      ? {
          status: String(sync.status || ""),
          expectedCount:
            sync.expected_count === null
              ? null
              : Number(sync.expected_count || 0),
          receivedCount: Number(sync.received_count || 0),
          completedAt: sync.completed_at ? iso(sync.completed_at) : null,
          startedAt: iso(sync.started_at),
          error: String(sync.error_message || ""),
        }
      : null,
  };
}

export async function getShopifyCatalogProductDetails(
  sku: string,
  titleHint = "",
  includeOptions = true,
  shopifyId = "",
) {
  await ensureDatabase();
  const normalizedSku = String(sku || "").trim();
  const normalizedShopifyId = String(shopifyId || "").trim();
  if (!normalizedSku && !normalizedShopifyId) return null;
  const rows = normalizedShopifyId
    ? await query<any>(
        `SELECT p.* FROM shopify_catalog_products p
         WHERE p.shopify_id = $1 LIMIT 1`,
        [normalizedShopifyId],
      )
    : await query<any>(
        `SELECT p.* FROM shopify_catalog_products p
         WHERE p.primary_sku = $1 OR EXISTS (
           SELECT 1 FROM jsonb_array_elements(p.variants_json) variant
           WHERE variant->>'sku' = $1
         )
         ORDER BY CASE WHEN LOWER(p.title) = LOWER($2) THEN 0 ELSE 1 END,
           p.shopify_updated_at DESC NULLS LAST
         LIMIT 1`,
        [normalizedSku, String(titleHint || "").trim()],
      );
  if (!rows[0]) return null;
  const product = catalogProductFromRow(rows[0]);
  const matchedVariant = product.variants.find(
    (variant) => String(variant?.sku || "").trim() === normalizedSku,
  );
  const barcodeSynced = product.variants.some((variant) =>
    Object.prototype.hasOwnProperty.call(variant, "barcode"),
  );
  const facets = includeOptions
    ? await getShopifyCatalogFacets()
    : { tags: [], collections: [] };
  return {
    id: product.shopifyId,
    status: product.status,
    title: product.title,
    description: product.descriptionHtml,
    descriptionHtml: product.descriptionHtml,
    tags: product.tags,
    collections: product.collections,
    weight: product.weight,
    weightUnit: product.weightUnit,
    barcode: String(matchedVariant?.barcode || ""),
    barcodeSynced,
    images: product.media.length
      ? product.media
      : product.imageUrl
        ? [
            {
              id: "",
              url: product.imageUrl,
              alt: product.imageAlt || product.title,
            },
          ]
        : [],
    availableTags: facets.tags,
    availableCollections: facets.collections,
  };
}

export async function getShopifyCatalogProductsBySkus(skus: string[]) {
  await ensureDatabase();
  const normalizedSkus = [
    ...new Set(skus.map((sku) => String(sku || "").trim()).filter(Boolean)),
  ].slice(0, 25000);
  if (!normalizedSkus.length)
    return new Map<
      string,
      {
        title: string;
        shopifyId: string;
        vendor: string;
        productType: string;
        tags: string[];
        collections: string[];
      }
    >();

  const rows = await query<{
    primary_sku: string;
    shopify_id: string;
    title: string;
    vendor: string;
    product_type: string;
    tags_json: unknown;
    collections_json: unknown;
    matched_variant_skus: unknown;
  }>(
    `SELECT p.shopify_id, p.primary_sku, p.title, p.vendor, p.product_type, p.tags_json,
       p.collections_json,
       ARRAY(
         SELECT variant->>'sku'
         FROM jsonb_array_elements(p.variants_json) variant
         WHERE variant->>'sku' IN (SELECT jsonb_array_elements_text($1::jsonb))
       ) AS matched_variant_skus
     FROM shopify_catalog_products p
     WHERE p.primary_sku IN (SELECT jsonb_array_elements_text($1::jsonb))
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(p.variants_json) variant
          WHERE variant->>'sku' IN (SELECT jsonb_array_elements_text($1::jsonb))
        )`,
    [JSON.stringify(normalizedSkus)],
  );
  const bySku = new Map<
    string,
    {
      title: string;
      shopifyId: string;
      vendor: string;
      productType: string;
      tags: string[];
      collections: string[];
    }
  >();
  rows.forEach((row) => {
    const product = {
      title: String(row.title || ""),
      shopifyId: String(row.shopify_id || ""),
      vendor: String(row.vendor || ""),
      productType: String(row.product_type || ""),
      tags: Array.isArray(row.tags_json) ? row.tags_json.map(String) : [],
      collections: Array.isArray(row.collections_json)
        ? row.collections_json.map(String)
        : [],
    };
    const primarySku = String(row.primary_sku || "").trim();
    if (primarySku) bySku.set(primarySku, product);
    const matchedVariantSkus = Array.isArray(row.matched_variant_skus)
      ? row.matched_variant_skus
      : [];
    matchedVariantSkus.forEach((value: unknown) => {
      const sku = String(value || "").trim();
      if (sku && !bySku.has(sku)) bySku.set(sku, product);
    });
  });
  return bySku;
}

export async function syncWinthorProductStatuses(
  products: WinthorStatusProduct[],
  sourceFile: string,
) {
  await ensureDatabase();
  const normalized = [
    ...new Map(
      products
        .map((product) => ({
          sku: String(product.sku || "").trim(),
          description: String(product.description || "")
            .trim()
            .slice(0, 500),
        }))
        .filter((product) => product.sku)
        .map((product) => [product.sku, product]),
    ).values(),
  ];
  if (!normalized.length)
    throw new Error("A sincronização não contém produtos válidos.");
  const batchId = randomBytes(16).toString("hex");
  await query(
    `INSERT INTO winthor_product_statuses
       (sku, description, status, batch_id, synced_at)
     SELECT sku, description, 'FORA_DE_LINHA', $2, NOW()
     FROM jsonb_to_recordset($1::jsonb) AS incoming(sku TEXT, description TEXT)
     ON CONFLICT (batch_id, sku) DO NOTHING`,
    [JSON.stringify(normalized), batchId],
  );
  await query(
    `INSERT INTO winthor_sync_runs (batch_id, source_file, item_count)
     VALUES ($1, $2, $3)`,
    [batchId, sourceFile.slice(0, 500), normalized.length],
  );
  await query("DELETE FROM winthor_product_statuses WHERE batch_id <> $1", [
    batchId,
  ]);
  return { batchId, synchronized: normalized.length };
}

export async function syncWinthorManufacturerCodes(
  products: Array<{ sku: string; manufacturerCode: string }>,
) {
  await ensureDatabase();
  const normalized = [
    ...new Map(
      products
        .map((product) => ({
          sku: String(product.sku || "").trim(),
          manufacturerCode: String(product.manufacturerCode || "")
            .trim()
            .slice(0, 160),
        }))
        .filter((product) => product.sku)
        .map((product) => [product.sku, product]),
    ).values(),
  ];
  if (!normalized.length)
    throw new Error("A sincronização não contém códigos WinThor válidos.");
  const rows = await query<{ updated: number }>(
    `WITH incoming AS (
       SELECT sku, manufacturer_code
       FROM jsonb_to_recordset($1::jsonb)
         AS data(sku TEXT, manufacturer_code TEXT)
     ), desired AS (
       SELECT p.shopify_id, COALESCE(i.manufacturer_code, '') AS manufacturer_code
       FROM shopify_catalog_products p
       LEFT JOIN incoming i ON i.sku = p.primary_sku
     ), changed AS (
       UPDATE shopify_catalog_products p
       SET manufacturer_code = desired.manufacturer_code
       FROM desired
       WHERE p.shopify_id = desired.shopify_id
         AND p.manufacturer_code IS DISTINCT FROM desired.manufacturer_code
       RETURNING p.shopify_id
     )
     SELECT COUNT(*)::int AS updated FROM changed`,
    [
      JSON.stringify(
        normalized.map((product) => ({
          sku: product.sku,
          manufacturer_code: product.manufacturerCode,
        })),
      ),
    ],
  );
  return {
    received: normalized.length,
    updated: Number(rows[0]?.updated || 0),
  };
}

export async function listShopifyCatalogIdsForWinthorSkus(skus: string[]) {
  await ensureDatabase();
  const normalizedSkus = [
    ...new Set(skus.map((sku) => String(sku || "").trim()).filter(Boolean)),
  ];
  if (!normalizedSkus.length) return [];

  // A aba Fora de linha associa o código WinThor ao SKU principal do produto.
  // Consultamos todos os IDs: display e unidade podem compartilhar o SKU.
  const rows = await query<{ shopify_id: string }>(
    `SELECT DISTINCT p.shopify_id
     FROM shopify_catalog_products p
     JOIN jsonb_array_elements_text($1::jsonb) AS input(sku)
       ON input.sku = p.primary_sku`,
    [JSON.stringify(normalizedSkus)],
  );
  return rows.map((row) => String(row.shopify_id || "")).filter(Boolean);
}

export async function getWinthorProductStatus(sku: string) {
  await ensureDatabase();
  const rows = await query<any>(
    `SELECT w.sku, w.description, w.synced_at,
       (SELECT p.manufacturer_code
          FROM shopify_catalog_products p
         WHERE p.primary_sku = $1
         LIMIT 1) AS manufacturer_code,
       EXISTS (SELECT 1 FROM winthor_sync_runs) AS has_sync
     FROM (SELECT 1) seed
     LEFT JOIN winthor_product_statuses w
       ON w.sku = $1
      AND w.batch_id = (
        SELECT batch_id FROM winthor_sync_runs ORDER BY created_at DESC LIMIT 1
      )
     LIMIT 1`,
    [String(sku || "").trim()],
  );
  const row = rows[0] || {};
  return {
    status: !row.has_sync
      ? ("PENDENTE" as const)
      : row.sku
        ? ("FORA_DE_LINHA" as const)
        : ("ATIVO" as const),
    description: String(row.description || ""),
    syncedAt: iso(row.synced_at),
    manufacturerCode: String(row.manufacturer_code || ""),
  };
}

export async function getShopifyCatalogFacets() {
  await ensureDatabase();
  const [facets] = await query<{
    vendors: string[];
    product_types: string[];
    statuses: string[];
    tags: string[];
    collections: string[];
  }>(`SELECT
    to_jsonb(ARRAY(SELECT DISTINCT vendor FROM shopify_catalog_products
      WHERE vendor <> '' ORDER BY vendor)) AS vendors,
    to_jsonb(ARRAY(SELECT DISTINCT product_type FROM shopify_catalog_products
      WHERE product_type <> '' ORDER BY product_type)) AS product_types,
    to_jsonb(ARRAY(SELECT DISTINCT status FROM shopify_catalog_products
      WHERE status <> '' ORDER BY status)) AS statuses,
    to_jsonb(ARRAY(SELECT DISTINCT value FROM shopify_catalog_products p,
      jsonb_array_elements_text(p.tags_json) AS tag(value)
      ORDER BY value)) AS tags,
    to_jsonb(ARRAY(SELECT DISTINCT value FROM shopify_catalog_products p,
      jsonb_array_elements_text(p.collections_json) AS collection(value)
      ORDER BY value)) AS collections`);
  const values = (items: unknown) =>
    Array.isArray(items) ? items.map(String).filter(Boolean) : [];
  return {
    vendors: values(facets?.vendors),
    productTypes: values(facets?.product_types),
    statuses: values(facets?.statuses),
    tags: values(facets?.tags),
    collections: values(facets?.collections),
  };
}

function shopifyProductRecord(product: ShopifyCatalogSyncProduct) {
  return {
    shopify_id: product.shopifyId,
    title: product.title,
    handle: product.handle,
    status: product.status,
    vendor: product.vendor,
    product_type: product.productType,
    tags_json: product.tags,
    collections_json: product.collections,
    description_html: product.descriptionHtml,
    image_url: product.imageUrl,
    image_alt: product.imageAlt,
    media_json: product.media,
    weight: product.weight,
    weight_unit: product.weightUnit,
    primary_sku: product.sku,
    variants_json: product.variants,
    total_inventory: product.totalInventory,
    price_min: product.priceMin,
    price_max: product.priceMax,
    shopify_updated_at: product.shopifyUpdatedAt || null,
  };
}

export async function beginShopifyCatalogSync(
  batchId: string,
  operationId: string,
) {
  await ensureDatabase();
  await query(
    `INSERT INTO shopify_catalog_sync_runs
       (batch_id, shopify_operation_id, status, started_at)
     VALUES ($1, $2, 'processing', NOW())
     ON CONFLICT (batch_id) DO UPDATE SET
       shopify_operation_id = EXCLUDED.shopify_operation_id,
       status = 'processing', expected_count = NULL, received_count = 0,
       error_message = '', started_at = NOW(), completed_at = NULL`,
    [batchId, operationId],
  );
  await query("DELETE FROM shopify_catalog_staging WHERE batch_id = $1", [
    batchId,
  ]);
}

export async function stageShopifyCatalogProducts(
  batchId: string,
  products: ShopifyCatalogSyncProduct[],
) {
  await ensureDatabase();
  if (!products.length) return 0;
  const run = await query<{ status: string }>(
    "SELECT status FROM shopify_catalog_sync_runs WHERE batch_id = $1",
    [batchId],
  );
  if (run[0]?.status !== "processing")
    throw new Error("Lote de sincronização inexistente ou já encerrado.");
  await query(
    `INSERT INTO shopify_catalog_staging
       (batch_id, shopify_id, title, handle, status, vendor, product_type,
        tags_json, collections_json, description_html, image_url, image_alt,
        media_json, weight, weight_unit, primary_sku, variants_json,
        total_inventory, price_min, price_max, shopify_updated_at)
     SELECT $1, shopify_id, title, handle, status, vendor, product_type,
       tags_json, collections_json, description_html, image_url, image_alt,
       media_json, weight, weight_unit, primary_sku, variants_json,
       total_inventory, price_min, price_max, shopify_updated_at
     FROM jsonb_to_recordset($2::jsonb) AS incoming(
       shopify_id TEXT, title TEXT, handle TEXT, status TEXT, vendor TEXT,
       product_type TEXT, tags_json JSONB, collections_json JSONB,
       description_html TEXT, image_url TEXT, image_alt TEXT, media_json JSONB,
       weight DOUBLE PRECISION, weight_unit TEXT, primary_sku TEXT, variants_json JSONB,
       total_inventory INTEGER, price_min DOUBLE PRECISION,
       price_max DOUBLE PRECISION, shopify_updated_at TIMESTAMPTZ
     )
     ON CONFLICT (batch_id, shopify_id) DO UPDATE SET
       title=EXCLUDED.title, handle=EXCLUDED.handle, status=EXCLUDED.status,
       vendor=EXCLUDED.vendor, product_type=EXCLUDED.product_type,
       tags_json=EXCLUDED.tags_json, collections_json=EXCLUDED.collections_json,
       description_html=EXCLUDED.description_html,
       image_url=EXCLUDED.image_url, image_alt=EXCLUDED.image_alt,
       media_json=EXCLUDED.media_json, weight=EXCLUDED.weight,
       weight_unit=EXCLUDED.weight_unit,
       primary_sku=EXCLUDED.primary_sku, variants_json=EXCLUDED.variants_json,
       total_inventory=EXCLUDED.total_inventory, price_min=EXCLUDED.price_min,
       price_max=EXCLUDED.price_max,
       shopify_updated_at=EXCLUDED.shopify_updated_at`,
    [batchId, JSON.stringify(products.map(shopifyProductRecord))],
  );
  const [{ total }] = await query<{ total: number }>(
    "SELECT COUNT(*)::int AS total FROM shopify_catalog_staging WHERE batch_id = $1",
    [batchId],
  );
  await query(
    "UPDATE shopify_catalog_sync_runs SET received_count = $2 WHERE batch_id = $1",
    [batchId, Number(total)],
  );
  return Number(total);
}

export async function upsertShopifyCatalogProducts(
  products: ShopifyCatalogSyncProduct[],
) {
  await ensureDatabase();
  if (!products.length) return 0;
  await query(
    `INSERT INTO shopify_catalog_products
       (shopify_id, title, handle, status, vendor, product_type, tags_json,
        collections_json, description_html, image_url, image_alt, media_json,
        weight, weight_unit, primary_sku, variants_json, total_inventory,
        price_min, price_max, shopify_updated_at, synced_at)
     SELECT shopify_id, title, handle, status, vendor, product_type, tags_json,
       collections_json, description_html, image_url, image_alt, media_json,
       weight, weight_unit, primary_sku, variants_json, total_inventory,
       price_min, price_max, shopify_updated_at, NOW()
     FROM jsonb_to_recordset($1::jsonb) AS incoming(
       shopify_id TEXT, title TEXT, handle TEXT, status TEXT, vendor TEXT,
       product_type TEXT, tags_json JSONB, collections_json JSONB,
       description_html TEXT, image_url TEXT, image_alt TEXT, media_json JSONB,
       weight DOUBLE PRECISION, weight_unit TEXT, primary_sku TEXT,
       variants_json JSONB, total_inventory INTEGER, price_min DOUBLE PRECISION,
       price_max DOUBLE PRECISION, shopify_updated_at TIMESTAMPTZ
     )
     ON CONFLICT (shopify_id) DO UPDATE SET
       title=EXCLUDED.title, handle=EXCLUDED.handle, status=EXCLUDED.status,
       vendor=EXCLUDED.vendor, product_type=EXCLUDED.product_type,
       tags_json=EXCLUDED.tags_json, collections_json=EXCLUDED.collections_json,
       description_html=EXCLUDED.description_html,
       image_url=EXCLUDED.image_url, image_alt=EXCLUDED.image_alt,
       media_json=EXCLUDED.media_json, weight=EXCLUDED.weight,
       weight_unit=EXCLUDED.weight_unit,
       primary_sku=EXCLUDED.primary_sku, variants_json=EXCLUDED.variants_json,
       total_inventory=EXCLUDED.total_inventory, price_min=EXCLUDED.price_min,
       price_max=EXCLUDED.price_max,
       shopify_updated_at=EXCLUDED.shopify_updated_at, synced_at=NOW()`,
    [JSON.stringify(products.map(shopifyProductRecord))],
  );
  return products.length;
}

export async function completeShopifyCatalogSync(
  batchId: string,
  expectedCount: number,
) {
  await ensureDatabase();
  const expected = Math.max(0, Math.trunc(expectedCount));
  const [{ total }] = await query<{ total: number }>(
    "SELECT COUNT(*)::int AS total FROM shopify_catalog_staging WHERE batch_id = $1",
    [batchId],
  );
  const received = Number(total || 0);
  if (!expected || received !== expected)
    throw new Error(
      `Lote incompleto: eram esperados ${expected} produtos e foram recebidos ${received}.`,
    );
  await query(
    `INSERT INTO shopify_catalog_products
       (shopify_id, title, handle, status, vendor, product_type, tags_json,
        collections_json, description_html, image_url, image_alt, media_json,
        weight, weight_unit, primary_sku, variants_json, total_inventory,
        price_min, price_max, shopify_updated_at, synced_at)
     SELECT shopify_id, title, handle, status, vendor, product_type, tags_json,
       collections_json, description_html, image_url, image_alt, media_json,
       weight, weight_unit, primary_sku, variants_json, total_inventory,
       price_min, price_max, shopify_updated_at, NOW()
     FROM shopify_catalog_staging WHERE batch_id = $1
     ON CONFLICT (shopify_id) DO UPDATE SET
       title=EXCLUDED.title, handle=EXCLUDED.handle, status=EXCLUDED.status,
       vendor=EXCLUDED.vendor, product_type=EXCLUDED.product_type,
       tags_json=EXCLUDED.tags_json, collections_json=EXCLUDED.collections_json,
       description_html=EXCLUDED.description_html,
       image_url=EXCLUDED.image_url, image_alt=EXCLUDED.image_alt,
       media_json=EXCLUDED.media_json, weight=EXCLUDED.weight,
       weight_unit=EXCLUDED.weight_unit,
       primary_sku=EXCLUDED.primary_sku, variants_json=EXCLUDED.variants_json,
       total_inventory=EXCLUDED.total_inventory, price_min=EXCLUDED.price_min,
       price_max=EXCLUDED.price_max, shopify_updated_at=EXCLUDED.shopify_updated_at,
       synced_at=NOW()`,
    [batchId],
  );
  await query(
    `DELETE FROM shopify_catalog_products current
     WHERE NOT EXISTS (
       SELECT 1 FROM shopify_catalog_staging staged
       WHERE staged.batch_id = $1 AND staged.shopify_id = current.shopify_id
     )`,
    [batchId],
  );
  await query(
    `UPDATE shopify_catalog_sync_runs
     SET status = 'completed', expected_count = $2, received_count = $2,
       completed_at = NOW(), error_message = ''
     WHERE batch_id = $1`,
    [batchId, expected],
  );
  await query("DELETE FROM shopify_catalog_staging WHERE batch_id = $1", [
    batchId,
  ]);
  await query(
    `DELETE FROM shopify_catalog_sync_runs
     WHERE batch_id <> $1 AND started_at < NOW() - INTERVAL '30 days'`,
    [batchId],
  );
  return { synchronized: received };
}

export async function failShopifyCatalogSync(batchId: string, error: string) {
  await ensureDatabase();
  await query(
    `UPDATE shopify_catalog_sync_runs
     SET status = 'failed', error_message = $2, completed_at = NOW()
     WHERE batch_id = $1`,
    [batchId, error.slice(0, 1000)],
  );
}

export async function archiveShopifyCatalogProducts(shopifyIds: string[]) {
  await ensureDatabase();
  const ids = [...new Set(shopifyIds.map(String).filter(Boolean))].slice(
    0,
    250,
  );
  if (!ids.length) return;
  await query(
    `UPDATE shopify_catalog_products
     SET status = 'ARCHIVED', shopify_updated_at = NOW(), synced_at = NOW()
     WHERE shopify_id IN (SELECT jsonb_array_elements_text($1::jsonb))`,
    [JSON.stringify(ids)],
  );
}

export async function deleteShopifyCatalogProducts(shopifyIds: string[]) {
  await ensureDatabase();
  const ids = [...new Set(shopifyIds.map(String).filter(Boolean))].slice(
    0,
    250,
  );
  if (!ids.length) return;
  await query(
    "DELETE FROM shopify_catalog_products WHERE shopify_id IN (SELECT jsonb_array_elements_text($1::jsonb))",
    [JSON.stringify(ids)],
  );
}

export type ImageSyncInput = {
  source: string;
  position: number;
};

export async function enqueueProductImages(
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
}

export async function enqueueProductImageDeletions(
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
}

export async function enqueueProductImageReorder(
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

export async function getN8nHealthSummary() {
  await ensureDatabase();
  const [jobs] = await query<{
    total: string;
    pending: string;
    expired: string;
    last_response: unknown;
    last_failure: unknown;
  }>(`
    SELECT COUNT(*)::text AS total,
      COUNT(*) FILTER (WHERE status = 'processando' AND created_at >= NOW() - INTERVAL '30 minutes')::text AS pending,
      COUNT(*) FILTER (WHERE status = 'processando' AND created_at < NOW() - INTERVAL '30 minutes')::text AS expired,
      MAX(created_at) FILTER (WHERE status = 'enviado' AND result_json IS NOT NULL) AS last_response,
      MAX(created_at) FILTER (
        WHERE status = 'enviado' AND result_json IS NOT NULL
          AND LOWER(COALESCE(result_json->>'processado', result_json->0->>'processado', '')) <> 'true'
          AND (
            LOWER(COALESCE(result_json->>'status', result_json->0->>'status', '')) ~ '^(erro|falha|error)'
            OR LOWER(COALESCE(result_json->>'sucesso', result_json->0->>'sucesso', '')) = 'false'
          )
      ) AS last_failure
    FROM reprocess_jobs
    WHERE source = 'reprocess'
  `);
  return {
    total: Number(jobs.total),
    pending: Number(jobs.pending),
    expired: Number(jobs.expired),
    lastResponse: jobs.last_response ? iso(jobs.last_response) : null,
    lastFailureAt: jobs.last_failure ? iso(jobs.last_failure) : null,
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
  source?: "reprocess" | "products";
}) {
  await ensureDatabase();
  await query(
    `INSERT INTO reprocess_jobs (request_id, sku, title, historical_date, user_id, status, result_json, source)
    VALUES ($1, $2, $3, $4, $5, 'processando', NULL, $6)`,
    [
      record.requestId,
      record.sku,
      record.title,
      record.historicalDate || null,
      record.userId,
      record.source || "reprocess",
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
  source?: "reprocess" | "products";
}) {
  await ensureDatabase();
  await query(
    `INSERT INTO reprocess_jobs (request_id, sku, title, historical_date, user_id, status, result_json, source)
    VALUES ($1, $2, $3, $4, $5, 'enviado', $6::jsonb, $7)`,
    [
      record.requestId,
      record.sku,
      record.title,
      record.historicalDate || null,
      record.userId,
      JSON.stringify(record.result || null),
      record.source || "reprocess",
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
    succeeded:
      row.status === "enviado" &&
      Boolean(row.result_json) &&
      isSuccessfulReprocessResult(row.result_json),
    result: jsonObject(row.result_json),
  };
}

export async function getProductAutomationStatuses(
  user: AuthUser,
  requestIds: string[],
) {
  const ids = [...new Set(requestIds.map(String).map((id) => id.trim()))]
    .filter(Boolean)
    .slice(0, 1000);
  if (!ids.length) return [];
  await ensureDatabase();
  const rows = await query<{
    request_id: string;
    status: string;
    result_json: unknown;
  }>(
    `SELECT request_id, status, result_json FROM reprocess_jobs
     WHERE request_id IN (SELECT jsonb_array_elements_text($1::jsonb))
       AND source = 'products'
       AND (user_id = $2 OR $3 = 'admin')`,
    [JSON.stringify(ids), user.id, user.role],
  );
  return rows.map((row) => ({
    requestId: row.request_id,
    completed: row.status === "enviado" && Boolean(row.result_json),
    succeeded:
      row.status === "enviado" &&
      Boolean(row.result_json) &&
      isSuccessfulReprocessResult(row.result_json),
  }));
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

export function isSuccessfulReprocessResult(payload: unknown) {
  const result = Array.isArray(payload)
    ? (payload[0] as Record<string, unknown> | undefined)
    : (payload as Record<string, unknown> | null);
  if (!result || typeof result !== "object") return false;

  const processed =
    result.processado === true ||
    String(result.processado || "").toLowerCase() === "true";
  // O callback usa este campo para confirmar a execução nova. Já `status`
  // também pertence ao histórico da planilha e pode carregar um erro antigo.
  if (processed) return true;

  const status = String(result.status || "")
    .trim()
    .toLocaleLowerCase("pt-BR");
  const failed =
    status.startsWith("erro") ||
    status.includes("falha") ||
    status.includes("error") ||
    result.sucesso === false ||
    String(result.sucesso || "").toLowerCase() === "false";
  if (failed) return false;

  return Boolean(
    result.sucesso === true ||
    String(result.sucesso || "").toLowerCase() === "true" ||
    status.includes("sucesso") ||
    isCompleteReprocessResult(result),
  );
}

export async function listLatestReprocessResults(): Promise<
  LatestReprocessResult[]
> {
  await ensureDatabase();
  const rows = await query<{
    sku: string;
    title: string;
    created_at: unknown;
    result_json: unknown;
  }>(`
    SELECT DISTINCT ON (LOWER(TRIM(sku))) sku, title, created_at, result_json
    FROM reprocess_jobs
    WHERE status = 'enviado'
      AND result_json IS NOT NULL
      AND source = 'reprocess'
      AND TRIM(sku) <> ''
    ORDER BY LOWER(TRIM(sku)), created_at DESC, id DESC
  `);
  return rows.map((row) => ({
    sku: row.sku,
    title: row.title,
    createdAt: iso(row.created_at),
    result: jsonObject(row.result_json),
  }));
}

export async function listLatestProcessingResults(): Promise<
  LatestReprocessResult[]
> {
  await ensureDatabase();
  const rows = await query<{
    sku: string;
    title: string;
    created_at: unknown;
    result_json: unknown;
  }>(`
    SELECT DISTINCT ON (COALESCE(NULLIF(result_json->>'shopify_id', ''), LOWER(TRIM(sku)))) sku, title, created_at, result_json
    FROM reprocess_jobs
    WHERE status = 'enviado'
      AND result_json IS NOT NULL
      AND source IN ('reprocess', 'products')
      AND TRIM(sku) <> ''
    ORDER BY COALESCE(NULLIF(result_json->>'shopify_id', ''), LOWER(TRIM(sku))), created_at DESC, id DESC
  `);
  return rows.map((row) => ({
    sku: row.sku,
    title: row.title,
    createdAt: iso(row.created_at),
    result: jsonObject(row.result_json),
  }));
}

export async function listLatestProductAutomationResults(): Promise<
  LatestReprocessResult[]
> {
  await ensureDatabase();
  const rows = await query<{
    sku: string;
    title: string;
    created_at: unknown;
    result_json: unknown;
  }>(`
    SELECT DISTINCT ON (LOWER(TRIM(sku))) sku, title, created_at, result_json
    FROM reprocess_jobs
    WHERE status = 'enviado'
      AND result_json IS NOT NULL
      AND source = 'products'
      AND TRIM(sku) <> ''
    ORDER BY LOWER(TRIM(sku)), created_at DESC, id DESC
  `);
  return rows.map((row) => ({
    sku: row.sku,
    title: row.title,
    createdAt: iso(row.created_at),
    result: jsonObject(row.result_json),
  }));
}

export async function listLatestProductAutomationResultsBySkus(
  skus: string[],
): Promise<LatestReprocessResult[]> {
  await ensureDatabase();
  const normalizedSkus = [
    ...new Set(
      skus
        .map((sku) =>
          String(sku || "")
            .trim()
            .toLocaleLowerCase("pt-BR"),
        )
        .filter(Boolean),
    ),
  ].slice(0, 250);
  if (!normalizedSkus.length) return [];
  const rows = await query<{
    sku: string;
    title: string;
    created_at: unknown;
    result_json: unknown;
  }>(
    `SELECT DISTINCT ON (LOWER(TRIM(sku))) sku, title, created_at, result_json
     FROM reprocess_jobs
     WHERE status = 'enviado'
       AND result_json IS NOT NULL
       AND source = 'products'
       AND LOWER(TRIM(sku)) IN (
         SELECT jsonb_array_elements_text($1::jsonb)
       )
     ORDER BY LOWER(TRIM(sku)), created_at DESC, id DESC`,
    [JSON.stringify(normalizedSkus)],
  );
  return rows.map((row) => ({
    sku: row.sku,
    title: row.title,
    createdAt: iso(row.created_at),
    result: jsonObject(row.result_json),
  }));
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
    WHERE reprocess_jobs.status = 'enviado'
      AND reprocess_jobs.result_json IS NOT NULL
      AND reprocess_jobs.source = 'reprocess'
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

export const getCurrentUser = cache(async () => {
  const { cookies } = await import("next/headers");
  const token = (await cookies()).get("pitter_session")?.value;
  return await getUserBySession(token);
});

export async function getAuthenticatedUser() {
  return await getCurrentUser();
}
