import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const EXECUTION_STATUSES = new Set([
  "new",
  "running",
  "success",
  "error",
  "canceled",
  "crashed",
  "waiting",
]);

function getApiBaseUrl() {
  const configured = String(
    process.env.N8N_API_BASE_URL ||
      process.env.N8N_PUBLIC_URL ||
      process.env.N8N_PRODUCT_AUTOMATION_WEBHOOK_URL ||
      process.env.N8N_REPROCESS_WEBHOOK_URL ||
      "",
  ).trim();
  if (!configured) return "";
  try {
    return new URL(configured).origin;
  } catch {
    return "";
  }
}

async function n8nRequest(path: string, apiKey: string, baseUrl: string) {
  const response = await fetch(`${baseUrl}/api/v1${path}`, {
    headers: { "X-N8N-API-KEY": apiKey },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload?.message || payload?.error || `HTTP ${response.status}`;
    throw new Error(`A API do n8n recusou a consulta: ${detail}`);
  }
  return payload;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin")
    return NextResponse.json(
      { error: "Acesso restrito a administradores." },
      { status: 403 },
    );

  const apiKey = String(process.env.N8N_API_KEY || "").trim();
  const baseUrl = getApiBaseUrl();
  if (!apiKey || !baseUrl)
    return NextResponse.json({
      configured: false,
      baseUrl,
      executions: [],
      workflows: [],
      summary: { running: 0, success: 0, error: 0, waiting: 0 },
      checkedAt: new Date().toISOString(),
    });

  const requestedStatus = String(
    request.nextUrl.searchParams.get("status") || "",
  ).trim();
  const status = EXECUTION_STATUSES.has(requestedStatus)
    ? requestedStatus
    : "";
  const limit = Math.min(
    100,
    Math.max(10, Number(request.nextUrl.searchParams.get("limit")) || 100),
  );

  try {
    const params = new URLSearchParams({
      limit: String(limit),
      includeData: "false",
    });
    if (status) params.set("status", status);

    const [executionPayload, workflowPayload] = await Promise.all([
      n8nRequest(`/executions?${params}`, apiKey, baseUrl),
      n8nRequest("/workflows?limit=250", apiKey, baseUrl),
    ]);
    const workflows = Array.isArray(workflowPayload?.data)
      ? workflowPayload.data.map((workflow: any) => ({
          id: String(workflow.id || ""),
          name: String(workflow.name || "Workflow sem nome"),
          active: Boolean(workflow.active),
        }))
      : [];
    const workflowNames = new Map(
      workflows.map((workflow: { id: string; name: string }) => [
        workflow.id,
        workflow.name,
      ]),
    );
    const executions = Array.isArray(executionPayload?.data)
      ? executionPayload.data.map((execution: any) => ({
          id: String(execution.id || ""),
          workflowId: String(execution.workflowId || ""),
          workflowName:
            workflowNames.get(String(execution.workflowId || "")) ||
            "Workflow removido",
          status: String(execution.status || "unknown"),
          mode: String(execution.mode || "unknown"),
          startedAt: execution.startedAt || null,
          stoppedAt: execution.stoppedAt || null,
          waitTill: execution.waitTill || null,
          retryOf: execution.retryOf || null,
        }))
      : [];

    const summary = executions.reduce(
      (counts: Record<string, number>, execution: { status: string }) => {
        if (execution.status === "running" || execution.status === "new")
          counts.running += 1;
        else if (execution.status === "success") counts.success += 1;
        else if (execution.status === "waiting") counts.waiting += 1;
        else if (["error", "crashed", "canceled"].includes(execution.status))
          counts.error += 1;
        return counts;
      },
      { running: 0, success: 0, error: 0, waiting: 0 },
    );

    return NextResponse.json({
      configured: true,
      baseUrl,
      executions,
      workflows,
      summary,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível consultar a API do n8n.",
      },
      { status: 502 },
    );
  }
}
