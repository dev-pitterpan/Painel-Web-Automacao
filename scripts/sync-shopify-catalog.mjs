import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadLocalEnv() {
  try {
    const content = readFileSync(path.join(root, ".env.local"), "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const separator = line.indexOf("=");
      const key = line.slice(0, separator).trim();
      const value = line
        .slice(separator + 1)
        .trim()
        .replace(/^(["'])(.*)\1$/, "$2");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

loadLocalEnv();

const storeDomain = String(process.env.SHOPIFY_STORE_DOMAIN || "").trim();
const apiVersion = String(process.env.SHOPIFY_API_VERSION || "2026-07").trim();
const dashboardUrl = String(
  process.env.SHOPIFY_CATALOG_API_URL ||
    "https://catalogo-pro-sepia.vercel.app/api/shopify-products",
).trim();
const syncToken = String(process.env.SHOPIFY_CATALOG_SYNC_TOKEN || "").trim();
const staticAccessToken = String(
  process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || "",
).trim();
const clientId = String(process.env.SHOPIFY_CLIENT_ID || "").trim();
const clientSecret = String(process.env.SHOPIFY_CLIENT_SECRET || "").trim();
const pollSeconds = Math.max(
  10,
  Number(process.env.SHOPIFY_BULK_POLL_SECONDS || 30),
);
const chunkSize = Math.min(
  250,
  Math.max(25, Number(process.env.SHOPIFY_SYNC_CHUNK_SIZE || 150)),
);

const bulkQuery = `{
  products {
    edges {
      node {
        __typename
        id
        title
        handle
        vendor
        productType
        status
        tags
        descriptionHtml
        updatedAt
        featuredImage { url altText }
        variants {
          edges {
            node {
              __typename
              id
              title
              sku
              barcode
              price
              inventoryQuantity
              inventoryItem {
                measurement {
                  weight { value unit }
                }
              }
            }
          }
        }
        collections {
          edges {
            node { __typename id title }
          }
        }
        media {
          edges {
            node {
              __typename
              ... on MediaImage {
                id
                alt
                image { url altText }
              }
            }
          }
        }
      }
    }
  }
}`;

function validateSettings() {
  const missing = [];
  if (!storeDomain) missing.push("SHOPIFY_STORE_DOMAIN");
  if (!syncToken) missing.push("SHOPIFY_CATALOG_SYNC_TOKEN");
  if (!staticAccessToken && !(clientId && clientSecret)) {
    missing.push(
      "SHOPIFY_ADMIN_ACCESS_TOKEN ou SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET",
    );
  }
  if (missing.length) {
    throw new Error(`Configurações ausentes: ${missing.join(", ")}`);
  }
}

function shopDomain() {
  const domain = storeDomain.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  return domain.includes(".") ? domain : `${domain}.myshopify.com`;
}

async function fetchWithRetry(url, options = {}, attempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(options.timeout || 120_000),
      });
      if (!response.ok) {
        const body = (await response.text()).slice(0, 1000);
        throw new Error(`HTTP ${response.status}: ${body}`);
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
      }
    }
  }
  throw lastError;
}

async function accessToken() {
  if (staticAccessToken) return staticAccessToken;
  const response = await fetchWithRetry(
    `https://${shopDomain()}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
      timeout: 30_000,
    },
  );
  const payload = await response.json();
  if (!payload.access_token) {
    throw new Error("A Shopify não retornou um token de acesso.");
  }
  return String(payload.access_token);
}

async function graphql(token, query, variables) {
  const response = await fetchWithRetry(
    `https://${shopDomain()}/admin/api/${apiVersion}/graphql.json`,
    {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
      timeout: 60_000,
    },
  );
  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(`Erro GraphQL: ${JSON.stringify(payload.errors)}`);
  }
  return payload.data;
}

async function dashboardRequest(payload) {
  const response = await fetchWithRetry(dashboardUrl, {
    method: "POST",
    headers: {
      "x-pitterpan-token": syncToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return response.json();
}

async function startBulk(token) {
  const mutation = `mutation StartCatalogBulk($query: String!) {
    bulkOperationRunQuery(query: $query) {
      bulkOperation { id status }
      userErrors { field message }
    }
  }`;
  const result = (await graphql(token, mutation, { query: bulkQuery }))
    .bulkOperationRunQuery;
  if (result.userErrors?.length) {
    throw new Error(
      `A Shopify recusou a operação: ${JSON.stringify(result.userErrors)}`,
    );
  }
  if (!result.bulkOperation?.id) {
    throw new Error("A Shopify não retornou o ID da operação em massa.");
  }
  return String(result.bulkOperation.id);
}

async function waitForBulk(token, operationId) {
  const query = `query CatalogBulkStatus($id: ID!) {
    bulkOperation(id: $id) {
      id status errorCode objectCount fileSize url partialDataUrl
    }
  }`;
  while (true) {
    const operation = (await graphql(token, query, { id: operationId }))
      .bulkOperation;
    if (!operation) throw new Error("A operação em massa não foi encontrada.");
    console.log(
      `Shopify: ${operation.status} (${operation.objectCount || 0} objetos)`,
    );
    if (operation.status === "COMPLETED") {
      if (!operation.url) {
        throw new Error("A operação terminou sem gerar arquivo JSONL.");
      }
      return String(operation.url);
    }
    if (["FAILED", "CANCELED", "EXPIRED"].includes(operation.status)) {
      throw new Error(
        `A operação terminou como ${operation.status}: ${operation.errorCode}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, pollSeconds * 1000));
  }
}

function emptyProduct(row) {
  const image = row.featuredImage || {};
  return {
    shopifyId: String(row.id || ""),
    title: String(row.title || ""),
    handle: String(row.handle || ""),
    status: String(row.status || "DRAFT"),
    vendor: String(row.vendor || ""),
    productType: String(row.productType || ""),
    tags: (row.tags || []).map(String),
    collections: [],
    descriptionHtml: String(row.descriptionHtml || ""),
    imageUrl: String(image.url || ""),
    imageAlt: String(image.altText || ""),
    media: [],
    weight: 0,
    weightUnit: "g",
    sku: "",
    variants: [],
    totalInventory: 0,
    priceMin: 0,
    priceMax: 0,
    shopifyUpdatedAt: String(row.updatedAt || ""),
  };
}

function finishProduct(product) {
  product.sku = product.variants.find((variant) => variant.sku)?.sku || "";
  product.totalInventory = product.variants.reduce(
    (total, variant) => total + variant.inventoryQuantity,
    0,
  );
  const prices = product.variants.map((variant) => variant.price);
  product.priceMin = prices.length ? Math.min(...prices) : 0;
  product.priceMax = prices.length ? Math.max(...prices) : 0;
  product.collections = [...new Set(product.collections)];
  const weightedVariant = product.variants.find(
    (variant) => variant.weight && Number.isFinite(variant.weight.value),
  );
  if (weightedVariant) {
    const { value, unit } = weightedVariant.weight;
    if (unit === "KILOGRAMS") {
      product.weight = value;
      product.weightUnit = "kg";
    } else {
      const factor =
        unit === "POUNDS" ? 453.59237 : unit === "OUNCES" ? 28.349523 : 1;
      product.weight = value * factor;
      product.weightUnit = "g";
    }
  }
  if (product.media.length) {
    product.imageUrl = product.media[0].url;
    product.imageAlt = product.media[0].alt;
  }
  product.variants = product.variants.map(({ weight, ...variant }) => variant);
  return product;
}

async function publishJsonl(downloadUrl, batchId) {
  const response = await fetchWithRetry(
    downloadUrl,
    { timeout: 10 * 60_000 },
    3,
  );
  if (!response.body) throw new Error("O arquivo JSONL está vazio.");
  const lines = createInterface({ input: Readable.fromWeb(response.body) });
  let current = null;
  let products = [];
  let total = 0;

  const flushCurrent = async () => {
    if (!current) return;
    products.push(finishProduct(current));
    current = null;
    total += 1;
    if (products.length >= chunkSize) {
      await dashboardRequest({
        action: "bulk_chunk",
        batchId,
        products,
      });
      products = [];
      console.log(`Dashboard: ${total} produtos preparados`);
    }
  };

  for await (const line of lines) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    if (row.__typename === "Product") {
      await flushCurrent();
      current = emptyProduct(row);
    } else if (current && row.__parentId === current.shopifyId) {
      if (row.__typename === "ProductVariant") {
        current.variants.push({
          id: String(row.id || ""),
          title: String(row.title || ""),
          sku: String(row.sku || ""),
          barcode: String(row.barcode || ""),
          price: Number(row.price || 0),
          inventoryQuantity: Number(row.inventoryQuantity || 0),
          weight: row.inventoryItem?.measurement?.weight || null,
        });
      } else if (row.__typename === "Collection" && row.title) {
        current.collections.push(String(row.title).trim());
      } else if (row.__typename === "MediaImage" && row.image?.url) {
        current.media.push({
          id: String(row.id || ""),
          url: String(row.image.url),
          alt: String(row.alt || row.image.altText || ""),
        });
      }
    }
  }
  await flushCurrent();
  if (products.length) {
    await dashboardRequest({ action: "bulk_chunk", batchId, products });
  }
  return total;
}

async function main() {
  const batchId = randomUUID().replaceAll("-", "");
  try {
    validateSettings();
    const token = await accessToken();
    console.log("Solicitando o catálogo completo à Shopify...");
    const operationId = await startBulk(token);
    await dashboardRequest({
      action: "bulk_begin",
      batchId,
      operationId,
    });
    const downloadUrl = await waitForBulk(token, operationId);
    const total = await publishJsonl(downloadUrl, batchId);
    await dashboardRequest({
      action: "bulk_complete",
      batchId,
      expectedCount: total,
    });
    console.log(`Sincronização concluída: ${total} produtos publicados.`);
  } catch (error) {
    console.error(`Erro na sincronização: ${error.message}`);
    if (syncToken) {
      try {
        await dashboardRequest({
          action: "bulk_fail",
          batchId,
          error: error.message,
        });
      } catch {}
    }
    process.exitCode = 1;
  }
}

await main();
