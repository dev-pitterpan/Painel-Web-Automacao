import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

const configuredDomain = String(process.env.SHOPIFY_STORE_DOMAIN || "")
  .trim()
  .replace(/^https?:\/\//i, "")
  .replace(/\/$/, "");
const shopDomain = configuredDomain.includes(".")
  ? configuredDomain
  : `${configuredDomain}.myshopify.com`;
const apiVersion = String(process.env.SHOPIFY_API_VERSION || "2026-07").trim();
const clientId = String(process.env.SHOPIFY_CLIENT_ID || "").trim();
const clientSecret = String(process.env.SHOPIFY_CLIENT_SECRET || "").trim();
const staticToken = String(process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
const configuredBaseUrl = String(
  process.env.SHOPIFY_WEBHOOK_BASE_URL ||
    process.env.SHOPIFY_CATALOG_API_URL ||
    "https://catalogo-pro-sepia.vercel.app",
).trim();
const webhookUri = `${new URL(configuredBaseUrl).origin}/api/shopify/webhooks/products`;
const topics = ["PRODUCTS_CREATE", "PRODUCTS_UPDATE", "PRODUCTS_DELETE"];

if (!configuredDomain || (!staticToken && !(clientId && clientSecret)))
  throw new Error("Credenciais da Shopify não configuradas.");

async function token() {
  if (staticToken) return staticToken;
  const response = await fetch(
    `https://${shopDomain}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    },
  );
  const payload = await response.json();
  if (!response.ok || !payload.access_token)
    throw new Error(
      `Falha ao autenticar na Shopify (HTTP ${response.status}).`,
    );
  return String(payload.access_token);
}

async function graphql(accessToken, query, variables = {}) {
  const response = await fetch(
    `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query, variables }),
    },
  );
  const payload = await response.json();
  if (!response.ok || payload.errors?.length)
    throw new Error(
      payload.errors?.map((error) => error.message).join(" ") ||
        `HTTP ${response.status}`,
    );
  return payload.data;
}

const accessToken = await token();
const existing = await graphql(
  accessToken,
  `
    query DashboardWebhooks($uri: String!) {
      webhookSubscriptions(first: 50, uri: $uri) {
        nodes {
          id
          topic
          uri
        }
      }
    }
  `,
  { uri: webhookUri },
);
const existingTopics = new Set(
  existing.webhookSubscriptions.nodes.map((subscription) => subscription.topic),
);

for (const topic of topics) {
  if (existingTopics.has(topic)) {
    console.log(`${topic}: já configurado`);
    continue;
  }
  const result = await graphql(
    accessToken,
    `
      mutation DashboardWebhookCreate(
        $topic: WebhookSubscriptionTopic!
        $webhookSubscription: WebhookSubscriptionInput!
      ) {
        webhookSubscriptionCreate(
          topic: $topic
          webhookSubscription: $webhookSubscription
        ) {
          webhookSubscription {
            id
            topic
            uri
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      topic,
      webhookSubscription: { uri: webhookUri, format: "JSON" },
    },
  );
  const errors = result.webhookSubscriptionCreate.userErrors || [];
  if (errors.length)
    throw new Error(
      `${topic}: ${errors.map((error) => error.message).join(" ")}`,
    );
  console.log(`${topic}: configurado em ${webhookUri}`);
}
