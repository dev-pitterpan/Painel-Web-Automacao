import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getN8nHealthSummary } from "@/lib/auth";
import { getHistoryRowsWithStatus } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });
  const startedAt = Date.now();
  let sheets;
  try {
    const result = await getHistoryRowsWithStatus(request.nextUrl.searchParams.get("refresh") === "1");
    sheets = {
      id: "sheets", name: "Google Sheets", status: "operational" as const,
      message: "Planilha acessível e dados sincronizados.", lastResponse: result.lastSyncedAt,
      latencyMs: Date.now() - startedAt,
      details: [
        { label: "Planilha", value: result.sheetName },
        { label: "Registros", value: result.rows.length.toLocaleString("pt-BR") },
        { label: "Erros na origem", value: result.rows.filter(row => String(row.status || "").toLowerCase().startsWith("erro")).length.toLocaleString("pt-BR") }
      ]
    };
  } catch (error) {
    sheets = { id: "sheets", name: "Google Sheets", status: "error" as const, message: error instanceof Error ? error.message : "Falha ao consultar a planilha.", lastResponse: null, latencyMs: Date.now() - startedAt, details: [{ label: "Conexão", value: "Indisponível" }] };
  }
  const n8nSummary = getN8nHealthSummary();
  const configured = Boolean(String(process.env.N8N_REPROCESS_WEBHOOK_URL || "").trim());
  const n8nStatus = !configured ? "error" : n8nSummary.pending > 0 ? "warning" : "operational";
  const n8n = {
    id: "n8n", name: "n8n", status: n8nStatus,
    message: !configured ? "Webhook de reprocessamento não configurado." : n8nSummary.pending ? `${n8nSummary.pending} processamento(s) aguardando conclusão.` : "Automação configurada e sem pendências.",
    lastResponse: n8nSummary.lastResponse,
    details: [
      { label: "Webhook", value: configured ? "Configurado" : "Não configurado" },
      { label: "Reprocessamentos", value: n8nSummary.total.toLocaleString("pt-BR") },
      { label: "Pendentes", value: n8nSummary.pending.toLocaleString("pt-BR") },
      { label: "Registros expirados", value: n8nSummary.expired.toLocaleString("pt-BR") },
      { label: "Última falha", value: n8nSummary.lastFailureAt ? new Date(n8nSummary.lastFailureAt).toLocaleString("pt-BR") : "Nenhuma registrada" }
    ]
  };
  return NextResponse.json({ checkedAt: new Date().toISOString(), overall: sheets.status === "operational" && n8n.status === "operational" ? "operational" : "attention", integrations: [sheets, n8n] });
}
