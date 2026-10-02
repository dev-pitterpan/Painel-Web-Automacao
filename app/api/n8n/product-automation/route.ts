import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  getCurrentUser,
  recordAudit,
  recordPendingReprocess,
} from "@/lib/auth";

const REQUEST_TIMEOUT_MS = 20000;
const DEFAULT_QUEUE_WEBHOOK =
  "https://n8n.pitterpan.com.br/webhook/fila-processamento-produtos";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();

  if (!user)
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  if (user.role !== "admin")
    return NextResponse.json(
      { error: "Apenas administradores podem executar a automação." },
      { status: 403 },
    );

  const body = await req.json().catch(() => null);
  const sku = String(body?.sku || "")
    .trim()
    .slice(0, 120);
  const titulo = String(body?.titulo || "")
    .trim()
    .slice(0, 500);
  const shopifyProductId = String(body?.shopifyProductId || "")
    .trim()
    .slice(0, 180);

  if (!sku)
    return NextResponse.json({ error: "SKU obrigatório." }, { status: 400 });
  if (!shopifyProductId)
    return NextResponse.json(
      { error: "ID Shopify obrigatório." },
      { status: 400 },
    );

  const requestId = randomUUID();
  const url = String(
    process.env.N8N_PRODUCT_AUTOMATION_WEBHOOK_URL || DEFAULT_QUEUE_WEBHOOK,
  ).trim();
  const token = String(process.env.N8N_REPROCESS_TOKEN || "").trim();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-request-id": requestId,
        ...(token ? { "x-pitterpan-token": token } : {}),
      },
      body: JSON.stringify({
        product_id: shopifyProductId,
        title: titulo,
        sku,
        request_id: requestId,
        origem: "dashboard-produtos",
        callback_url: `${req.nextUrl.origin}/api/n8n/product-automation/callback`,
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
    let parsed: any = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }

    if (!response.ok || parsed?.ok === false) {
      const detail =
        parsed?.error || parsed?.message || raw || `HTTP ${response.status}`;
      throw new Error(String(detail));
    }

    await recordPendingReprocess({
      requestId,
      sku,
      title: titulo,
      historicalDate: null,
      userId: user.id,
      source: "products",
    });

    await recordAudit({
      userId: user.id,
      action: "product_automation_requested",
      entity: "product",
      details: { requestId, sku, shopifyProductId },
    });

    return NextResponse.json({
      ok: true,
      completed: false,
      requestId,
      message: "Produto adicionado à fila da automação.",
    });
  } catch (error) {
    await recordAudit({
      userId: user.id,
      action: "product_automation_failed",
      entity: "integration",
      details: {
        requestId,
        sku,
        shopifyProductId,
        error: error instanceof Error ? error.message : "Falha desconhecida",
      },
    });

    return NextResponse.json(
      {
        ok: false,
        requestId,
        error:
          error instanceof Error && error.name === "AbortError"
            ? "O n8n demorou mais de 20 segundos para aceitar o produto na fila."
            : `Falha ao enviar o produto para a fila: ${
                error instanceof Error ? error.message : "falha desconhecida"
              }`,
      },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
