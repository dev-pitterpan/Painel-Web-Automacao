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

type N8nProbe = {
  ok: boolean;
  status: number | null;
  latencyMs: number;
  error: string;
};

async function probeN8n(url: string): Promise<N8nProbe> {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
    });
    return {
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - startedAt,
      error: "",
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      latencyMs: Date.now() - startedAt,
      error:
        error instanceof Error ? error.message : "Falha ao conectar ao n8n.",
    };
  }
}

async function getN8nConnectionHealth(webhookUrl: string) {
  try {
    const origin = new URL(webhookUrl).origin;
    const [process, readiness] = await Promise.all([
      probeN8n(`${origin}/healthz`),
      probeN8n(`${origin}/healthz/readiness`),
    ]);
    return {
      origin,
      process,
      readiness,
      checkedAt: new Date().toISOString(),
      latencyMs: Math.max(process.latencyMs, readiness.latencyMs),
    };
  } catch {
    return null;
  }
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
  const n8nWebhookUrl = String(
    process.env.N8N_REPROCESS_WEBHOOK_URL ||
      process.env.N8N_PRODUCT_AUTOMATION_WEBHOOK_URL ||
      "",
  ).trim();
  const configured = Boolean(n8nWebhookUrl);
  const n8nConnection = configured
    ? await getN8nConnectionHealth(n8nWebhookUrl)
    : null;
  const lastResponseAt = n8nSummary.lastResponse
    ? new Date(n8nSummary.lastResponse).getTime()
    : 0;
  const lastFailureAt = n8nSummary.lastFailureAt
    ? new Date(n8nSummary.lastFailureAt).getTime()
    : 0;
  const failureWarningWindowMs = 24 * 60 * 60 * 1000;
  const hasUnresolvedFailure =
    lastFailureAt > Date.now() - failureWarningWindowMs &&
    (!lastResponseAt || lastFailureAt > lastResponseAt);
  const n8nSlow = Boolean(
    n8nConnection &&
    (n8nConnection.process.latencyMs > 5_000 ||
      n8nConnection.readiness.latencyMs > 5_000),
  );
  const n8nStatus =
    !configured || !n8nConnection
      ? "error"
      : !n8nConnection.process.ok || !n8nConnection.readiness.ok
        ? "error"
        : hasUnresolvedFailure || n8nSummary.pending > 0 || n8nSlow
          ? "warning"
          : "operational";
  const n8n = {
    id: "n8n",
    name: "n8n",
    status: n8nStatus,
    message: !configured
      ? "Webhook de reprocessamento não configurado."
      : !n8nConnection
        ? "A configuração do servidor n8n é inválida."
        : !n8nConnection.process.ok
          ? n8nConnection.process.status
            ? `O servidor n8n está inacessível (HTTP ${n8nConnection.process.status}).`
            : "O servidor n8n não respondeu dentro do tempo esperado."
          : !n8nConnection.readiness.ok
            ? n8nConnection.readiness.status
              ? `O servidor responde, mas não está pronto para operar (HTTP ${n8nConnection.readiness.status}).`
              : "O servidor responde, mas a prontidão não pôde ser confirmada."
            : n8nSlow
              ? "O servidor está conectado, mas responde com lentidão."
              : hasUnresolvedFailure
                ? "A última tentativa de reprocessamento falhou e ainda não houve uma resposta posterior."
                : n8nSummary.pending
                  ? `${n8nSummary.pending} processamento(s) aguardando conclusão.`
                  : "Automação configurada e respondendo normalmente.",
    lastResponse: n8nConnection?.checkedAt || n8nSummary.lastResponse,
    latencyMs: n8nConnection?.latencyMs,
    details: [
      {
        label: "Servidor",
        value: !n8nConnection
          ? "Não verificado"
          : n8nConnection.process.ok
            ? `Online · HTTP ${n8nConnection.process.status}`
            : n8nConnection.process.status
              ? `Falha · HTTP ${n8nConnection.process.status}`
              : "Sem resposta",
      },
      {
        label: "Prontidão",
        value: !n8nConnection
          ? "Não verificada"
          : n8nConnection.readiness.ok
            ? `Pronto · HTTP ${n8nConnection.readiness.status}`
            : n8nConnection.readiness.status
              ? `Indisponível · HTTP ${n8nConnection.readiness.status}`
              : "Sem resposta",
      },
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
        label: "Último workflow",
        value: n8nSummary.lastResponse
          ? formatDateTime(n8nSummary.lastResponse)
          : "Nenhuma resposta registrada",
      },
      {
        label: "Última falha",
        value: n8nSummary.lastFailureAt
          ? formatDateTime(n8nSummary.lastFailureAt)
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

