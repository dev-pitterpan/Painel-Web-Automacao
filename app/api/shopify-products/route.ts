import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  deleteShopifyCatalogProduct,
  getCurrentUser,
  getShopifyCatalogFacets,
  listShopifyCatalogProducts,
  upsertShopifyCatalogProducts,
  type ShopifyCatalogProduct,
} from "@/lib/auth";

function validSyncToken(req: NextRequest) {
  const expected = String(
    process.env.SHOPIFY_CATALOG_SYNC_TOKEN || process.env.N8N_REPROCESS_TOKEN || "",
  ).trim();
  const received = String(
    req.headers.get("x-pitterpan-token") ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
      "",
  ).trim();
  if (!expected || !received) return false;
  const left = createHash("sha256").update(expected).digest();
  const right = createHash("sha256").update(received).digest();
  return timingSafeEqual(left, right);
}

function text(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function productFromPayload(value: any): Omit<ShopifyCatalogProduct, "syncedAt"> {
  const variants = Array.isArray(value?.variants)
    ? value.variants.slice(0, 250).map((variant: any) => ({
        id: text(variant?.id, 160),
        title: text(variant?.title),
        sku: text(variant?.sku, 160),
        price: Number(variant?.price || 0),
        inventoryQuantity: Number(variant?.inventoryQuantity || 0),
      }))
    : [];
  return {
    shopifyId: text(value?.shopifyId || value?.id, 180),
    title: text(value?.title),
    handle: text(value?.handle),
    status: text(value?.status || "DRAFT", 30).toUpperCase(),
    vendor: text(value?.vendor),
    productType: text(value?.productType),
    tags: Array.isArray(value?.tags) ? value.tags.map((item: unknown) => text(item, 160)).filter(Boolean) : [],
    collections: Array.isArray(value?.collections)
      ? value.collections.map((item: unknown) => text(item, 160)).filter(Boolean)
      : [],
    imageUrl: text(value?.imageUrl, 2000),
    imageAlt: text(value?.imageAlt),
    sku: text(value?.sku || variants[0]?.sku, 160),
    variants,
    totalInventory: Number(value?.totalInventory || 0),
    priceMin: Number(value?.priceMin || 0),
    priceMax: Number(value?.priceMax || 0),
    shopifyUpdatedAt: text(value?.shopifyUpdatedAt || value?.updatedAt, 80),
  };
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  try {
    const params = req.nextUrl.searchParams;
    const result = await listShopifyCatalogProducts({
      query: params.get("q") || "",
      status: params.get("status") || "",
      vendor: params.get("vendor") || "",
      tag: params.get("tag") || "",
      collection: params.get("collection") || "",
      productType: params.get("productType") || "",
      page: Number(params.get("page") || 1),
      perPage: Number(params.get("perPage") || 50),
      sort: (params.get("sort") || "updated") as "updated" | "title" | "title_desc" | "inventory",
    });
    const facets = params.get("facets") === "1" ? await getShopifyCatalogFacets() : undefined;
    return NextResponse.json({
      ...result,
      facets,
      permissions: { canEditProducts: user.role === "admin" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao carregar produtos." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  if (!validSyncToken(req))
    return NextResponse.json({ error: "Token de sincronização inválido." }, { status: 401 });
  try {
    const body = await req.json();
    const action = text(body?.action || "upsert", 20);
    if (action === "delete") {
      const shopifyId = text(body?.shopifyId || body?.id, 180);
      if (!shopifyId) return NextResponse.json({ error: "ID obrigatório." }, { status: 400 });
      await deleteShopifyCatalogProduct(shopifyId);
      return NextResponse.json({ ok: true, deleted: 1 });
    }
    const products = (Array.isArray(body?.products) ? body.products : [body?.product])
      .filter(Boolean)
      .slice(0, 250)
      .map(productFromPayload)
      .filter((product: Omit<ShopifyCatalogProduct, "syncedAt">) =>
        product.shopifyId && product.title,
      );
    if (!products.length)
      return NextResponse.json({ error: "Nenhum produto válido recebido." }, { status: 400 });
    await upsertShopifyCatalogProducts(products);
    return NextResponse.json({
      ok: true,
      synchronized: products.length,
      cursor: body?.cursor || null,
      hasNextPage: Boolean(body?.hasNextPage),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao sincronizar catálogo." },
      { status: 500 },
    );
  }
}
