import { createHmac, timingSafeEqual } from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import {
  deleteShopifyCatalogProducts,
  upsertShopifyCatalogProducts,
} from "@/lib/auth";
import {
  fetchShopifyProduct,
  shopifyProductToCatalog,
} from "@/lib/shopify-admin";

export const runtime = "nodejs";

function validHmac(rawBody: string, received: string) {
  const secret = String(process.env.SHOPIFY_CLIENT_SECRET || "").trim();
  if (!secret || !received) return false;
  const expected = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(received, "base64");
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function validShop(received: string) {
  const configured = String(process.env.SHOPIFY_STORE_DOMAIN || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "");
  const expected = configured.includes(".")
    ? configured
    : `${configured}.myshopify.com`;
  return (
    Boolean(configured) && received.toLowerCase() === expected.toLowerCase()
  );
}

function productGid(payload: any) {
  const graphqlId = String(payload?.admin_graphql_api_id || "").trim();
  if (/^gid:\/\/shopify\/Product\/\d+$/.test(graphqlId)) return graphqlId;
  const numericId = String(payload?.id || "").trim();
  return /^\d+$/.test(numericId) ? `gid://shopify/Product/${numericId}` : "";
}

async function applyProductWebhook(topic: string, productId: string) {
  if (topic === "products/delete") {
    await deleteShopifyCatalogProducts([productId]);
    return;
  }
  const product = await fetchShopifyProduct(productId);
  if (!product) {
    await deleteShopifyCatalogProducts([productId]);
    return;
  }
  await upsertShopifyCatalogProducts([shopifyProductToCatalog(product)]);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const hmac = String(req.headers.get("x-shopify-hmac-sha256") || "").trim();
  const shop = String(req.headers.get("x-shopify-shop-domain") || "").trim();
  const topic = String(req.headers.get("x-shopify-topic") || "")
    .trim()
    .toLowerCase();
  if (!validHmac(rawBody, hmac) || !validShop(shop))
    return NextResponse.json(
      { error: "Assinatura inválida." },
      { status: 401 },
    );
  if (
    !["products/create", "products/update", "products/delete"].includes(topic)
  )
    return NextResponse.json({ ok: true, ignored: true });
  const payload = JSON.parse(rawBody || "{}");
  const productId = productGid(payload);
  if (!productId)
    return NextResponse.json({ error: "Produto inválido." }, { status: 400 });
  after(async () => {
    try {
      await applyProductWebhook(topic, productId);
    } catch (error) {
      console.error("Falha ao aplicar webhook Shopify", {
        topic,
        productId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  return NextResponse.json({ ok: true });
}
