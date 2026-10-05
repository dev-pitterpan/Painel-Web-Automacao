import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  deleteShopifyCatalogProducts,
  getCurrentUser,
  recordAudit,
  upsertShopifyCatalogProducts,
} from "@/lib/auth";
import {
  archiveShopifyProduct,
  deleteShopifyProduct,
  getShopifySalesChannels,
  shopifyProductToCatalog,
  unpublishShopifyProduct,
  updateShopifyProductSalesChannels,
} from "@/lib/shopify-admin";

const actions = [
  "archive",
  "unpublish",
  "delete",
  "publish_channels",
  "unpublish_channels",
] as const;
type BulkAction = (typeof actions)[number];

function text(value: unknown, max: number) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function cleanProducts(value: unknown) {
  if (!Array.isArray(value)) return [];
  const products = value.slice(0, 250).flatMap((item) => {
    const shopifyId = text(item?.shopifyId, 180);
    if (!/^gid:\/\/shopify\/Product\/\d+$/.test(shopifyId)) return [];
    return [
      {
        shopify_id: shopifyId,
        sku: text(item?.sku, 120),
        title: text(item?.title, 500),
      },
    ];
  });
  return [
    ...new Map(
      products.map((product) => [product.shopify_id, product]),
    ).values(),
  ];
}

function cleanPublicationIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((item) => text(item, 200))
        .filter((item) => /^gid:\/\/shopify\/Publication\/\d+$/.test(item)),
    ),
  ].slice(0, 100);
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  try {
    return NextResponse.json({ channels: await getShopifySalesChannels() });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível carregar os canais de venda.",
      },
      { status: 502 },
    );
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (user.role !== "admin")
    return NextResponse.json(
      { error: "Apenas administradores podem gerenciar produtos." },
      { status: 403 },
    );

  const body = await req.json().catch(() => null);
  const action = text(body?.action, 30) as BulkAction;
  const products = cleanProducts(body?.products);
  const publicationIds = cleanPublicationIds(body?.publicationIds);
  if (!actions.includes(action))
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  if (!products.length)
    return NextResponse.json(
      { error: "Nenhum produto válido foi selecionado." },
      { status: 400 },
    );
  if (action.endsWith("_channels") && !publicationIds.length)
    return NextResponse.json(
      { error: "Selecione ao menos um canal de venda." },
      { status: 400 },
    );

  const requestId = randomUUID();

  try {
    const failures: string[] = [];
    const completedIds: string[] = [];
    for (let index = 0; index < products.length; index += 5) {
      const batch = products.slice(index, index + 5);
      const results = await Promise.allSettled(
        batch.map(async (product) => {
          if (action === "archive") {
            const archived = await archiveShopifyProduct(product.shopify_id);
            await upsertShopifyCatalogProducts([
              shopifyProductToCatalog(archived),
            ]);
          } else if (action === "unpublish") {
            await unpublishShopifyProduct(product.shopify_id);
          } else if (
            action === "publish_channels" ||
            action === "unpublish_channels"
          ) {
            await updateShopifyProductSalesChannels(
              product.shopify_id,
              publicationIds.map((publicationId) => ({
                publicationId,
                published: action === "publish_channels",
              })),
            );
          } else {
            await deleteShopifyProduct(product.shopify_id);
          }
          return product;
        }),
      );
      results.forEach((result, batchIndex) => {
        const product = batch[batchIndex];
        if (result.status === "fulfilled")
          completedIds.push(product.shopify_id);
        else
          failures.push(
            `${product.title || product.sku || product.shopify_id}: ${
              result.reason instanceof Error
                ? result.reason.message
                : "falha desconhecida"
            }`,
          );
      });
    }
    if (action === "delete" && completedIds.length)
      await deleteShopifyCatalogProducts(completedIds);

    await recordAudit({
      userId: user.id,
      action: `products_${action}`,
      entity: "product",
      details: {
        requestId,
        count: completedIds.length,
        requestedCount: products.length,
        productIds: completedIds,
        failures,
      },
    });

    if (failures.length)
      throw new Error(
        `${completedIds.length} de ${products.length} produto(s) concluído(s). ${failures.slice(0, 5).join(" ")}`,
      );

    const actionMessage = {
      archive:
        products.length === 1
          ? "1 produto arquivado com sucesso."
          : `${products.length} produtos arquivados com sucesso.`,
      unpublish:
        products.length === 1
          ? "1 produto removido dos canais de venda."
          : `${products.length} produtos removidos dos canais de venda.`,
      delete:
        products.length === 1
          ? "1 produto excluído com sucesso."
          : `${products.length} produtos excluídos com sucesso.`,
      publish_channels:
        products.length === 1
          ? "1 produto incluído nos canais selecionados."
          : `${products.length} produtos incluídos nos canais selecionados.`,
      unpublish_channels:
        products.length === 1
          ? "1 produto removido dos canais selecionados."
          : `${products.length} produtos removidos dos canais selecionados.`,
    }[action];
    return NextResponse.json({
      ok: true,
      requestId,
      count: completedIds.length,
      message: actionMessage,
    });
  } catch (error) {
    await recordAudit({
      userId: user.id,
      action: `products_${action}_failed`,
      entity: "product",
      details: {
        requestId,
        count: products.length,
        error: error instanceof Error ? error.message : "Falha desconhecida",
      },
    });
    return NextResponse.json(
      {
        error: `Não foi possível concluir a ação na Shopify: ${error instanceof Error ? error.message : "falha desconhecida"}`,
      },
      { status: 502 },
    );
  }
}
