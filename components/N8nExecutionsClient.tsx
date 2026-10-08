"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Clock3,
  ExternalLink,
  RefreshCw,
  Search,
  Timer,
  Workflow,
  XCircle,
} from "lucide-react";

type Execution = {
  id: string;
  workflowId: string;
  workflowName: string;
  status: string;
  mode: string;
  startedAt: string | null;
  stoppedAt: string | null;
  waitTill: string | null;
  retryOf: string | null;
};

type Payload = {
  configured: boolean;
  baseUrl: string;
  executions: Execution[];
  workflows: Array<{ id: string; name: string; active: boolean }>;
  summary: { running: number; success: number; error: number; waiting: number };
  checkedAt: string;
};

const statusLabels: Record<string, string> = {
  new: "Preparando",
  running: "Executando",
  success: "Sucesso",
  error: "Erro",
  crashed: "Interrompida",
  canceled: "Cancelada",
  waiting: "Aguardando",
};

const modeLabels: Record<string, string> = {
  webhook: "Webhook",
  trigger: "Agendada",
  manual: "Manual",
  retry: "Repetição",
  integrated: "Integrada",
};

function dateTime(value: string | null) {
  return value ? new Date(value).toLocaleString("pt-BR") : "—";
}

function duration(execution: Execution, now: number) {
  if (!execution.startedAt) return "—";
  const start = new Date(execution.startedAt).getTime();
  const end = execution.stoppedAt
    ? new Date(execution.stoppedAt).getTime()
    : now;
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

export function N8nExecutionsClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [workflowId, setWorkflowId] = useState("all");
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/n8n/executions?limit=100", {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(payload?.error || "Não foi possível consultar o n8n.");
      setData(payload);
      setNow(Date.now());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha inesperada.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let refresh: number | undefined;

    const schedule = async (immediate = false) => {
      if (!active) return;
      if (document.visibilityState === "visible") await load(!immediate);
      if (active) refresh = window.setTimeout(() => schedule(), 2_000);
    };
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (refresh) window.clearTimeout(refresh);
      schedule();
    };

    schedule(true);
    document.addEventListener("visibilitychange", handleVisibility);
    const clock = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      active = false;
      if (refresh) window.clearTimeout(refresh);
      window.clearInterval(clock);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [load]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return (data?.executions || []).filter((execution) => {
      const matchesStatus =
        status === "all" ||
        (status === "running"
          ? ["running", "new"].includes(execution.status)
          : status === "error"
            ? ["error", "crashed", "canceled"].includes(execution.status)
            : execution.status === status);
      const matchesWorkflow =
        workflowId === "all" || execution.workflowId === workflowId;
      const matchesQuery =
        !normalized ||
        execution.id.includes(normalized) ||
        execution.workflowName.toLocaleLowerCase("pt-BR").includes(normalized);
      return matchesStatus && matchesWorkflow && matchesQuery;
    });
  }, [data, query, status, workflowId]);

  const cards = [
    { label: "Executando", value: data?.summary.running || 0, icon: Activity, tone: "running" },
    { label: "Sucesso", value: data?.summary.success || 0, icon: CheckCircle2, tone: "success" },
    { label: "Falhas", value: data?.summary.error || 0, icon: XCircle, tone: "error" },
    { label: "Aguardando", value: data?.summary.waiting || 0, icon: Clock3, tone: "waiting" },
  ];

  return (
    <>
      <div className="page-head n8n-page-head">
        <div>
          <h1 className="page-title">n8n</h1>
          <div className="page-sub">
            Acompanhe as execuções em tempo real, sem precisar atualizar a página.
          </div>
        </div>
        <div className="n8n-head-actions">
          {data?.checkedAt ? (
            <small>Atualizado em {new Date(data.checkedAt).toLocaleTimeString("pt-BR")}</small>
          ) : null}
          <button className="btn" onClick={() => load()} disabled={loading}>
            <RefreshCw className={loading ? "spin" : ""} size={16} />
            Atualizar
          </button>
        </div>
      </div>

      {error ? (
        <section className="panel n8n-message n8n-message-error">
          <XCircle size={21} />
          <div><strong>Não foi possível consultar o n8n</strong><p>{error}</p></div>
        </section>
      ) : null}

      {!loading && data && !data.configured ? (
        <section className="panel n8n-setup">
          <span><Workflow size={24} /></span>
          <div>
            <h2>Conecte a API do n8n</h2>
            <p>Crie uma chave no n8n e adicione as variáveis protegidas abaixo na Vercel.</p>
            <code>N8N_API_BASE_URL</code>
            <code>N8N_API_KEY</code>
          </div>
        </section>
      ) : null}

      {data?.configured ? (
        <>
          <section className="n8n-summary-grid">
            {cards.map(({ label, value, icon: Icon, tone }) => (
              <article className={`panel n8n-summary n8n-summary-${tone}`} key={label}>
                <span><Icon size={19} /></span>
                <div><small>{label}</small><strong>{value}</strong></div>
              </article>
            ))}
          </section>

          <section className="panel n8n-executions-panel">
            <header className="n8n-toolbar">
              <div className="n8n-search">
                <Search size={16} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar workflow ou execução" />
              </div>
              <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filtrar por status">
                <option value="all">Todos os status</option>
                <option value="running">Executando</option>
                <option value="success">Sucesso</option>
                <option value="error">Falhas</option>
                <option value="waiting">Aguardando</option>
              </select>
              <select value={workflowId} onChange={(event) => setWorkflowId(event.target.value)} aria-label="Filtrar por workflow">
                <option value="all">Todos os workflows</option>
                {(data.workflows || []).map((workflow) => (
                  <option value={workflow.id} key={workflow.id}>{workflow.name}</option>
                ))}
              </select>
              <span className="n8n-result-count">{filtered.length} execuções</span>
            </header>

            <div className="table-wrap n8n-table">
              <table>
                <thead><tr><th>Status</th><th>Workflow</th><th>Início</th><th>Duração</th><th>Origem</th><th>Execução</th></tr></thead>
                <tbody>
                  {filtered.length ? filtered.map((execution) => (
                    <tr key={execution.id}>
                      <td data-label="Status"><span className={`n8n-status n8n-status-${execution.status}`}>{statusLabels[execution.status] || execution.status}</span></td>
                      <td data-label="Workflow"><strong>{execution.workflowName}</strong><small>{execution.workflowId}</small></td>
                      <td data-label="Início">{dateTime(execution.startedAt)}</td>
                      <td data-label="Duração"><span className="n8n-duration"><Timer size={14} />{duration(execution, now)}</span></td>
                      <td data-label="Origem">{modeLabels[execution.mode] || execution.mode}</td>
                      <td data-label="Execução">
                        <a className="n8n-execution-link" href={`${data.baseUrl}/workflow/${execution.workflowId}/executions/${execution.id}`} target="_blank" rel="noreferrer">
                          #{execution.id}<ExternalLink size={13} />
                        </a>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={6} className="empty">Nenhuma execução encontrada com esses filtros.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : loading ? <section className="panel n8n-loading">Consultando execuções...</section> : null}
    </>
  );
}


