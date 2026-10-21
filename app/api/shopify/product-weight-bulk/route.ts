import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, upsertShopifyCatalogProducts } from "@/lib/auth";
import {
  shopifyProductToCatalog,
  updateShopifyProductWeight,
} from "@/lib/shopify-admin";

type SelectedProduct = { shopifyId: string; title: string };

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (user.role !== "admin")
    return NextResponse.json(
      { error: "Apenas administradores podem editar produtos." },
      { status: 403 },
    );

  const body = await request.json().catch(() => null);
  const weight = body?.weight;
  const weightUnit = body?.weightUnit;
  if (
    typeof weight !== "number" ||
    !Number.isFinite(weight) ||
    weight < 0 ||
    weight > 1_000_000 ||
    (weightUnit !== "g" && weightUnit !== "kg")
  )
    return NextResponse.json({ error: "Peso inválido." }, { status: 400 });

  const source = body?.products;
  if (!Array.isArray(source) || !source.length || source.length > 5)
    return NextResponse.json(
      { error: "Selecione de 1 a 5 produtos por lote." },
      { status: 400 },
    );
  const products: SelectedProduct[] = source.map((item: unknown) => {
    const product = item as Record<string, unknown> | null;
    return {
      shopifyId: String(product?.shopifyId ?? "").trim(),
      title: String(product?.title ?? "").trim().slice(0, 255),
    };
  });
  if (
    products.some(
      (product) => !/^gid:\/\/shopify\/Product\/\d+$/.test(product.shopifyId),
    ) ||
    new Set(products.map((product) => product.shopifyId)).size !== products.length
  )
    return NextResponse.json(
      { error: "A seleção contém produtos inválidos ou repetidos." },
      { status: 400 },
    );

  const results = await Promise.all(
    products.map(async (product) => {
      try {
        const updated = await updateShopifyProductWeight(
          product.shopifyId,
          weight,
          weightUnit,
        );
        await upsertShopifyCatalogProducts([shopifyProductToCatalog(updated)]);
        return { shopifyId: product.shopifyId, ok: true as const };
      } catch (cause) {
        return {
          shopifyId: product.shopifyId,
          ok: false as const,
          error: `${product.title || product.shopifyId}: ${
            cause instanceof Error ? cause.message : "falha desconhecida"
          }`,
        };
      }
    }),
  );
  return NextResponse.json({ ok: true, results });
}
