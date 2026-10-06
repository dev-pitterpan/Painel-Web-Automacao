import { NextRequest, NextResponse } from "next/server";
import {
  getAppSettings,
  getCurrentUser,
  getN8nHealthSummary,
  getShopifyCatalogHealthSummary,
} from "@/lib/auth";
import { getHistoryRowsWithStatus } from "@/lib/googleSheets";
import { getShopifyHealthSnapshot } from "@/lib/shopify-admin";

export const dynamic = "force-dynamic";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin")
    return NextResponse.json(
      { error: "Acesso restrito a administradores." },
      { status: 403 },
    );
  const startedAt = Date.now();
  const settings = await getAppSettings();
  let sheets;
  try {
    const result = await getHistoryRowsWithStatus(
      request.nextUrl.searchParams.get("refresh") === "1",
    );
    const stale =
      Date.now() - new Date(result.lastSyncedAt).getTime() >
      settings.staleSyncMinutes * 60000;
    sheets = {
      id: "sheets",
      name: "Google Sheets",
      status: stale ? ("warning" as const) : ("operational" as const),
      message: stale
        ? `A última sincronização ultrapassou ${settings.staleSyncMinutes} minutos.`
        : "Planilha acessível e dados sincronizados.",
      lastResponse: result.lastSyncedAt,
      latencyMs: Date.now() - startedAt,
      details: [
        { label: "Planilha", value: result.sheetName },
        {
          label: "Registros",
          value: result.rows.length.toLocaleString("pt-BR"),
        },
        {
          label: "Erros na origem",
          value: result.rows
            .filter((row) =>
              String(row.status || "")
                .toLowerCase()
                .startsWith("erro"),
            )
            .length.toLocaleString("pt-BR"),
        },
      ],
    };
  } catch (error) {
    sheets = {
      id: "sheets",
      name: "Google Sheets",
      status: "error" as const,
      message:
        error instanceof Error
          ? error.message
          : "Falha ao consultar a planilha.",
      lastResponse: null,
      latencyMs: Date.now() - startedAt,
      details: [{ label: "Conexão", value: "Indisponível" }],
    };
  }
  const shopifyStartedAt = Date.now();
  let shopify;
  try {
    const [remote, local] = await Promise.all([
      getShopifyHealthSnapshot(),
      getShopifyCatalogHealthSummary(),
    ]);
    const requiredScopes = [
      "read_inventory",
      "read_products",
      "write_products",
      "write_files",
      "read_publications",
      "write_publications",
    ];
    const missingScopes = requiredScopes.filter(
      (scope) => !remote.scopes.includes(scope),
    );
    const catalogMatches = remote.productCount === local.productCount;
    const latestSyncFailed = local.latestSync?.status === "failed";
    const status = missingScopes.length
      ? ("error" as const)
      : !catalogMatches || latestSyncFailed
        ? ("warning" as const)
        : ("operational" as const);
    shopify = {
      id: "shopify",
      name: "Shopify",
      status,
      message: missingScopes.length
        ? `Faltam permissões no aplicativo: ${missingScopes.join(", ")}.`
        : latestSyncFailed
          ? "A API está conectada, mas a última sincronização completa falhou."
          : !catalogMatches
            ? "A API está conectada, mas o catálogo local ainda está sendo atualizado."
            : "API conectada e catálogo recebido corretamente.",
      lastResponse: new Date().toISOString(),
      latencyMs: Date.now() - shopifyStartedAt,
      details: [
        { label: "Loja", value: remote.shopName },
        {
          label: "Produtos na Shopify",
          value: remote.productCount.toLocaleString("pt-BR"),
        },
        {
          label: "Produtos no painel",
          value: local.productCount.toLocaleString("pt-BR"),
        },
        {
          label: "Canais de venda",
          value: remote.channelCount.toLocaleString("pt-BR"),
        },
        {
          label: "Última sincronização",
          value: local.latestSync?.completedAt
            ? formatDateTime(local.latestSync.completedAt)
            : local.lastReceivedAt
              ? formatDateTime(local.lastReceivedAt)
              : "Nenhuma registrada",
        },
        {
          label: "Permissões",
          value: missingScopes.length ? "Incompletas" : "Autorizadas",
        },
      ],
    };
  } catch (error) {
    shopify = {
      id: "shopify",
      name: "Shopify",
      status: "error" as const,
      message:
        error instanceof Error
          ? error.message
          : "Falha ao consultar a API da Shopify.",
      lastResponse: null,
      latencyMs: Date.now() - shopifyStartedAt,
      details: [{ label: "Conexão", value: "Indisponível" }],
    };
  }
  const n8nSummary = await getN8nHealthSummary();
  const configured = Boolean(
    String(process.env.N8N_REPROCESS_WEBHOOK_URL || "").trim(),
  );
  const lastResponseAt = n8nSummary.lastResponse
    ? new Date(n8nSummary.lastResponse).getTime()
    : 0;
  const lastFailureAt = n8nSummary.lastFailureAt
    ? new Date(n8nSummary.lastFailureAt).getTime()
    : 0;
  const hasUnresolvedFailure =
    lastFailureAt > 0 && (!lastResponseAt || lastFailureAt > lastResponseAt);
  const n8nStatus = !configured
    ? "error"
    : hasUnresolvedFailure
      ? "error"
      : n8nSummary.pending > 0
        ? "warning"
        : "operational";
  const n8n = {
    id: "n8n",
    name: "n8n",
    status: n8nStatus,
    message: !configured
      ? "Webhook de reprocessamento não configurado."
      : hasUnresolvedFailure
        ? "A última tentativa de reprocessamento falhou e ainda não houve uma resposta posterior."
        : n8nSummary.pending
          ? `${n8nSummary.pending} processamento(s) aguardando conclusão.`
          : "Automação configurada e respondendo normalmente.",
    lastResponse: n8nSummary.lastResponse,
    details: [
      {
        label: "Webhook",
        value: configured ? "Configurado" : "Não configurado",
      },
      {
        label: "Reprocessamentos",
        value: n8nSummary.total.toLocaleString("pt-BR"),
      },
      { label: "Pendentes", value: n8nSummary.pending.toLocaleString("pt-BR") },
      {
        label: "Históricos sem callback",
        value: n8nSummary.expired.toLocaleString("pt-BR"),
      },
      {
        label: "Última falha",
        value: n8nSummary.lastFailureAt
          ? new Date(n8nSummary.lastFailureAt).toLocaleString("pt-BR")
          : "Nenhuma registrada",
      },
    ],
  };
  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    overall:
      sheets.status === "operational" &&
      n8n.status === "operational" &&
      shopify.status === "operational"
        ? "operational"
        : "attention",
    integrations: [shopify, sheets, n8n],
  });
}
