import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  archiveShopifyCatalogProducts,
  deleteShopifyCatalogProducts,
  getCurrentUser,
  recordAudit,
} from "@/lib/auth";

const TIMEOUT_MS = 55000;
const DEFAULT_WEBHOOK =
  "https://n8n.pitterpan.com.br/webhook/dashboard-gerenciar-produtos";
const actions = ["archive", "unpublish", "delete"] as const;
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
  if (!actions.includes(action))
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  if (!products.length)
    return NextResponse.json(
      { error: "Nenhum produto válido foi selecionado." },
      { status: 400 },
    );

  const requestId = randomUUID();
  const url = text(
    process.env.N8N_PRODUCT_BULK_WEBHOOK_URL || DEFAULT_WEBHOOK,
    1000,
  );
  const token = text(
    process.env.N8N_PRODUCT_BULK_TOKEN ||
      process.env.N8N_PRODUCT_EDITOR_TOKEN ||
      process.env.N8N_REPROCESS_TOKEN,
    1000,
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-request-id": requestId,
        ...(token ? { "x-pitterpan-token": token } : {}),
      },
      body: JSON.stringify({
        action,
        request_id: requestId,
        products,
        origem: "dashboard-pitter-pan",
        solicitado_em: new Date().toISOString(),
        solicitado_por: {
          id: user.id,
          nome: user.name,
          email: user.email,
          perfil: user.role,
        },
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    const raw = await response.text();
    let result: any = null;
    try {
      result = raw ? JSON.parse(raw) : null;
    } catch {
      result = null;
    }
    if (!response.ok || result?.ok === false)
      throw new Error(
        text(
          result?.error || result?.message || raw || `HTTP ${response.status}`,
          1500,
        ),
      );

    const ids = products.map((product) => product.shopify_id);
    if (action === "archive") await archiveShopifyCatalogProducts(ids);
    if (action === "delete") await deleteShopifyCatalogProducts(ids);

    await recordAudit({
      userId: user.id,
      action: `products_${action}`,
      entity: "product",
      details: { requestId, count: products.length, productIds: ids },
    });

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
    }[action];
    return NextResponse.json({
      ok: true,
      requestId,
      count: products.length,
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
        error:
          error instanceof Error && error.name === "AbortError"
            ? "O n8n demorou mais de 55 segundos para responder."
            : `Não foi possível concluir a ação no Shopify: ${error instanceof Error ? error.message : "falha desconhecida"}`,
      },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
