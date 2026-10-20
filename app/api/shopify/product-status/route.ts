import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, upsertShopifyCatalogProducts } from "@/lib/auth";
import { setShopifyProductStatus, shopifyProductToCatalog } from "@/lib/shopify-admin";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (user.role !== "admin")
    return NextResponse.json({ error: "Apenas administradores podem editar produtos." }, { status: 403 });

  const body = await req.json().catch(() => null);
  const shopifyId = String(body?.shopifyId ?? "").trim();
  const status = String(body?.status ?? "").trim().toUpperCase();
  if (!/^gid:\/\/shopify\/Product\/\d+$/.test(shopifyId))
    return NextResponse.json({ error: "Produto inválido." }, { status: 400 });
  if (status !== "ACTIVE" && status !== "DRAFT" && status !== "UNLISTED")
    return NextResponse.json({ error: "Status inválido." }, { status: 400 });

  try {
    const updated = await setShopifyProductStatus(shopifyId, status);
    const product = shopifyProductToCatalog(updated);
    await upsertShopifyCatalogProducts([product]);
    return NextResponse.json({
      ok: true,
      product: {
        status: product.status,
        title: product.title,
        description: product.descriptionHtml,
        tags: product.tags,
        collections: product.collections,
        weight: product.weight,
        weightUnit: product.weightUnit,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao atualizar o Shopify." },
      { status: 502 },
    );
  }
}
