"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Clock3,
  RefreshCw,
  XCircle,
} from "lucide-react";

type Integration = {
  id: string;
  name: string;
  status: "operational" | "warning" | "error";
  message: string;
  lastResponse: string | null;
  latencyMs?: number;
  details: Array<{ label: string; value: string }>;
};
type HealthData = {
  checkedAt: string;
  overall: "operational" | "attention";
  integrations: Integration[];
};

const iconById = {
  sheets: "/icons/google-sheets.png",
  n8n: "/icons/n8n.png",
} as const;

export function IntegrationHealthClient() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function check(force = false) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/health${force ? "?refresh=1" : ""}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          payload.error || "Não foi possível verificar as integrações.",
        );
      setData(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha inesperada.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    check();
  }, []);
  return (
    <>
      <div className="page-head health-page-head">
        <div>
          <h1 className="page-title">Saúde das integrações</h1>
          <div className="page-sub">
            Acompanhamento técnico das conexões que mantêm a automação em
            funcionamento.
          </div>
        </div>
        <button className="btn" onClick={() => check(true)} disabled={loading}>
          <RefreshCw className={loading ? "spin" : ""} size={16} />
          Verificar agora
        </button>
      </div>
      {error ? (
        <section className="panel health-error">
          <XCircle size={22} />
          <div>
            <strong>Não foi possível concluir a verificação</strong>
            <p>{error}</p>
          </div>
        </section>
      ) : null}
      <section
        className={`health-overview ${data?.overall === "attention" ? "needs-attention" : ""}`}
      >
        <span>
          <Activity size={19} />
        </span>
        <div>
          <small>Estado geral</small>
          <strong>
            {loading && !data
              ? "Verificando integrações..."
              : data?.overall === "operational"
                ? "Todos os serviços operacionais"
                : "Há itens que precisam de atenção"}
          </strong>
        </div>
        {data && (
          <time>
            <Clock3 size={14} />
            Verificado em {new Date(data.checkedAt).toLocaleString("pt-BR")}
          </time>
        )}
      </section>
      <div className="health-grid">
        {(data?.integrations || []).map((integration) => {
          const iconSrc = iconById[integration.id as keyof typeof iconById];
          return (
            <article
              className={`panel integration-card status-${integration.status}`}
              key={integration.id}
            >
              <header>
                <span className="integration-brand-icon">
                  {iconSrc ? <img src={iconSrc} alt="" aria-hidden="true" /> : null}
                </span>
                <div>
                  <h2>{integration.name}</h2>
                  <p>{integration.message}</p>
                </div>
                <span className="integration-status">
                  {integration.status === "operational" ? (
                    <CheckCircle2 size={15} />
                  ) : (
                    <XCircle size={15} />
                  )}
                  {integration.status === "operational"
                    ? "Operacional"
                    : integration.status === "warning"
                      ? "Atenção"
                      : "Falha"}
                </span>
              </header>
              <dl>
                {integration.details.map((item) => (
                  <div key={item.label}>
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
              <footer>
                <span>Última resposta</span>
                <strong>
                  {integration.lastResponse
                    ? new Date(integration.lastResponse).toLocaleString("pt-BR")
                    : "Nenhuma resposta registrada"}
                </strong>
                {integration.latencyMs !== undefined && (
                  <em>{integration.latencyMs} ms</em>
                )}
              </footer>
            </article>
          );
        })}
        {loading &&
          !data &&
          [0, 1].map((item) => (
            <div
              className="panel integration-card health-skeleton"
              key={item}
            />
          ))}
      </div>
      <section className="panel health-note">
        <strong>Como essa verificação funciona</strong>
        <p>
          O Google Sheets é consultado diretamente. Para o n8n, o painel usa a
          configuração e o histórico real de reprocessamentos, sem acionar o
          webhook e sem alterar produtos.
        </p>
      </section>
    </>
  );
}
