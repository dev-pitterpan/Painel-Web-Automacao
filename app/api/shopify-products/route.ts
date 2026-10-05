import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  beginShopifyCatalogSync,
  completeShopifyCatalogSync,
  failShopifyCatalogSync,
  getCurrentUser,
  getShopifyCatalogFacets,
  getShopifyCatalogProductDetails,
  listShopifyCatalogProducts,
  stageShopifyCatalogProducts,
  type ShopifyCatalogSyncProduct,
} from "@/lib/auth";

function validSyncToken(req: NextRequest) {
  const expected = String(process.env.SHOPIFY_CATALOG_SYNC_TOKEN || "").trim();
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
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function productFromPayload(value: any): ShopifyCatalogSyncProduct {
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
    tags: Array.isArray(value?.tags)
      ? value.tags.map((item: unknown) => text(item, 160)).filter(Boolean)
      : [],
    collections: Array.isArray(value?.collections)
      ? value.collections
          .map((item: unknown) => text(item, 160))
          .filter(Boolean)
      : [],
    descriptionHtml: text(value?.descriptionHtml, 100000),
    imageUrl: text(value?.imageUrl, 2000),
    imageAlt: text(value?.imageAlt),
    media: Array.isArray(value?.media)
      ? value.media.slice(0, 250).flatMap((item: any) => {
          const url = text(item?.url, 2000);
          return url
            ? [{ id: text(item?.id, 180), url, alt: text(item?.alt) }]
            : [];
        })
      : [],
    weight: Number(value?.weight || 0),
    weightUnit: value?.weightUnit === "kg" ? "kg" : "g",
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
  if (!user)
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  try {
    const params = req.nextUrl.searchParams;
    if (params.get("details") === "1") {
      const product = await getShopifyCatalogProductDetails(
        params.get("sku") || "",
        params.get("title") || "",
        params.get("compact") !== "1",
      );
      return product
        ? NextResponse.json({ product })
        : NextResponse.json(
            { error: "Produto não encontrado no catálogo sincronizado." },
            { status: 404 },
          );
    }
    const result = await listShopifyCatalogProducts({
      query: params.get("q") || "",
      status: params.get("status") || "",
      vendor: params.get("vendor") || "",
      tag: params.get("tag") || "",
      collection: params.get("collection") || "",
      productType: params.get("productType") || "",
      winthorStatus: params.get("winthorStatus") || "",
      page: Number(params.get("page") || 1),
      perPage: Number(params.get("perPage") || 50),
      sort: (params.get("sort") || "updated") as
        "updated" | "title" | "title_desc" | "inventory",
    });
    const facets =
      params.get("facets") === "1"
        ? await getShopifyCatalogFacets()
        : undefined;
    return NextResponse.json({
      ...result,
      facets,
      permissions: { canEditProducts: user.role === "admin" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erro ao carregar produtos.",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  if (!validSyncToken(req))
    return NextResponse.json(
      { error: "Token de sincronização inválido." },
      { status: 401 },
    );
  try {
    const body = await req.json();
    const action = text(body?.action || "upsert", 30);
    const batchId = text(body?.batchId, 180);
    if (action === "bulk_begin") {
      if (!batchId)
        return NextResponse.json(
          { error: "Identificador do lote obrigatório." },
          { status: 400 },
        );
      await beginShopifyCatalogSync(batchId, text(body?.operationId, 250));
      return NextResponse.json({ ok: true, batchId });
    }
    if (action === "bulk_complete") {
      if (!batchId)
        return NextResponse.json(
          { error: "Identificador do lote obrigatório." },
          { status: 400 },
        );
      const result = await completeShopifyCatalogSync(
        batchId,
        Number(body?.expectedCount || 0),
      );
      return NextResponse.json({ ok: true, batchId, ...result });
    }
    if (action === "bulk_fail") {
      if (batchId)
        await failShopifyCatalogSync(
          batchId,
          text(body?.error || "Falha informada pelo sincronizador.", 1000),
        );
      return NextResponse.json({ ok: true, batchId });
    }
    if (action !== "bulk_chunk")
      return NextResponse.json(
        { error: "Ação de sincronização inválida." },
        { status: 400 },
      );
    const products = (
      Array.isArray(body?.products) ? body.products : [body?.product]
    )
      .filter(Boolean)
      .slice(0, 250)
      .map(productFromPayload)
      .filter(
        (product: ShopifyCatalogSyncProduct) =>
          product.shopifyId && product.title,
      );
    if (!products.length)
      return NextResponse.json(
        { error: "Nenhum produto válido recebido." },
        { status: 400 },
      );
    if (!batchId)
      return NextResponse.json(
        { error: "Identificador do lote obrigatório." },
        { status: 400 },
      );
    const stagedTotal = await stageShopifyCatalogProducts(batchId, products);
    return NextResponse.json({
      ok: true,
      synchronized: products.length,
      stagedTotal,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao sincronizar catálogo.",
      },
      { status: 500 },
    );
  }
}
