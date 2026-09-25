import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getCurrentUser, isCompleteReprocessResult, recordAudit, recordPendingReprocess, recordReprocess } from "@/lib/auth";

const REQUEST_TIMEOUT_MS = 20000;

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Não autenticado." },
      { status: 401 }
    );
  }

  const url = String(
    process.env.N8N_REPROCESS_WEBHOOK_URL || ""
  ).trim();

  if (!url) {
    return NextResponse.json(
      { error: "Webhook do n8n ainda não configurado." },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null);

  const sku = String(body?.sku || "")
    .trim()
    .slice(0, 120);

  const titulo = String(body?.titulo || "")
    .trim()
    .slice(0, 500);

  const dataHoraHistorico = String(
    body?.dataHora || ""
  )
    .trim()
    .slice(0, 80);

  if (!sku) {
    return NextResponse.json(
      { error: "SKU obrigatório." },
      { status: 400 }
    );
  }

  const requestId = randomUUID();

  const payload = {
    request_id: requestId,
    sku,
    titulo,
    data_hora_historico: dataHoraHistorico || null,
    origem: "dashboard-pitter-pan",
    solicitado_em: new Date().toISOString(),
    solicitado_por: {
      id: user.id,
      nome: user.name,
      email: user.email,
      perfil: user.role
    }
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-request-id": requestId
  };

  const token = String(
    process.env.N8N_REPROCESS_TOKEN || ""
  ).trim();

  if (token) {
    headers["x-pitterpan-token"] = token;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS
  );

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal
    });

    const raw = await response.text();

    let parsed: any = null;

    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      const detail =
        parsed?.message ||
        parsed?.error ||
        raw ||
        `HTTP ${response.status}`;

      await recordAudit({ userId: user.id, action: "reprocess_failed", entity: "integration", details: { requestId, sku, status: response.status, error: String(detail).slice(0, 500) } });
      return NextResponse.json(
        {
          ok: false,
          requestId,
          error: `O n8n recusou o reprocessamento: ${String(detail).slice(0, 1200)}`
        },
        { status: 502 }
      );
    }

    const completed = isCompleteReprocessResult(parsed);

    if (completed) {
      await recordReprocess({
        requestId,
        sku,
        title: titulo,
        historicalDate: dataHoraHistorico,
        userId: user.id,
        result: parsed
      });
    } else {
      await recordPendingReprocess({
        requestId,
        sku,
        title: titulo,
        historicalDate: dataHoraHistorico,
        userId: user.id
      });
    }
    await recordAudit({ userId: user.id, action: "reprocess_requested", entity: "product", details: { requestId, sku, completed } });

    return NextResponse.json({
      ok: true,
      completed,
      requestId,
      message:
        completed
          ? parsed?.message || "Produto enviado para reprocessamento."
          : "O n8n aceitou o produto, mas ainda não concluiu o processamento.",
      n8n: parsed || (raw ? { response: raw.slice(0, 1200) } : null)
    });
  } catch (error) {
    await recordAudit({ userId: user.id, action: "reprocess_failed", entity: "integration", details: { requestId, sku, error: error instanceof Error ? error.message : "Falha desconhecida" } });
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        {
          ok: false,
          requestId,
          error: "O n8n demorou mais de 20 segundos para responder."
        },
        { status: 504 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        requestId,
        error:
          error instanceof Error
            ? `Falha ao conectar com o n8n: ${error.message}`
            : "Falha desconhecida ao conectar com o n8n."
      },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
