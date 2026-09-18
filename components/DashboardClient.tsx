"use client";

import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";
import { AlertCircle, Bell, CheckCircle2, Clock3, FileText, LoaderCircle, PackageCheck, RefreshCw, Tags, WandSparkles, X } from "lucide-react";
import type { DashboardData, HistoryRow } from "@/lib/types";

const colors = [
  "#233b8f",
  "#ffd722",
  "#ef1f2f",
  "#16a36a",
  "#7b61ff",
  "#f5a623",
  "#4fb3df",
  "#9aa6bd"
];

const fmt = (m: number) =>
  `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;

const Badge = ({ status }: { status: string }) => (
  <span
    className={`badge ${
      String(status || "")
        .toLowerCase()
        .startsWith("erro")
        ? "badge-error"
        : "badge-success"
    }`}
  >
    {String(status || "")
      .toLowerCase()
      .startsWith("erro")
      ? "Erro"
      : "Sucesso"}
  </span>
);

const Metric = ({
  label,
  value,
  note,
  comparison,
  inverse = false,
  icon: Icon,
  tone = "blue"
}: {
  label: string;
  value: string | number;
  note?: string;
  comparison?: number | null;
  inverse?: boolean;
  icon: LucideIcon;
  tone?: "blue" | "green" | "red" | "gold" | "violet";
}) => (
  <div className={`metric-card metric-${tone}`}>
    <div className="metric-top"><span className="metric-icon"><Icon size={17} /></span><div className="metric-label">{label}</div></div>
    <div className="metric-bottom">
      <div className="metric-value">{value}</div>
      {comparison !== undefined && (
        <div className="metric-change-wrap">
          <div className={`metric-comparison ${comparison === null ? "is-neutral" : ((comparison >= 0) !== inverse ? "is-positive" : "is-negative")}`}>
            {comparison === null ? "Sem base" : `${comparison >= 0 ? "↑" : "↓"} ${comparison >= 0 ? "+" : ""}${comparison.toFixed(2)}%`}
          </div>
          {comparison !== null && <span className="metric-previous">vs. período anterior</span>}
        </div>
      )}
      {note && <div className="metric-note">{note}</div>}
    </div>
  </div>
);

type ApiError = {
  error?: string;
};

type NotificationItem = {
  id: string;
  tone: "success" | "error";
  message: string;
  createdAt: string;
};

export function DashboardClient({
  mode = "dashboard"
}: {
  mode?: "dashboard" | "products" | "errors";
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [marca, setMarca] = useState("");
  const [days, setDays] = useState("30");
  const [loadingProgress, setLoadingProgress] = useState(14);
  const [loadingExiting, setLoadingExiting] = useState(false);
  const [reprocessState, setReprocessState] = useState<Record<string, "sending" | "pending" | "success" | "error">>({});
  const [toast, setToast] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  async function load(refresh = false) {
    setLoading(true);
    setLoadingExiting(false);
    setError("");

    try {
      const p = new URLSearchParams({
        days,
        q,
        marca
      });

      if (mode === "errors") {
        p.set("status", "erro");
      }

      if (refresh) {
        p.set("refresh", "1");
      }

      const response = await fetch(
        `/api/dashboard?${p.toString()}`,
        {
          cache: "no-store"
        }
      );

      const json = (await response.json()) as DashboardData & ApiError;

      if (!response.ok || json?.error) {
        throw new Error(
          json?.error ||
            `Erro HTTP ${response.status}`
        );
      }

      // Proteção adicional contra resposta incompleta
      const safeData: DashboardData = {
        rows: Array.isArray(json.rows)
          ? json.rows
          : [],

        metrics: json.metrics || {
          total: 0,
          sucesso: 0,
          erros: 0,
          taxaSucesso: 0,
          titulosAlterados: 0,
          tagsAlteradas: 0,
          colecoesAlteradas: 0,
          descricoesGeradas: 0,
          tempoEconomizadoMin: 0,
          comparisons: {
            total: null,
            sucesso: null,
            erros: null,
            taxaSucesso: null,
            titulosAlterados: null,
            tagsAlteradas: null,
            colecoesAlteradas: null,
            descricoesGeradas: null,
            tempoEconomizadoMin: null
          }
        },

        byDay: Array.isArray(json.byDay)
          ? json.byDay
          : [],

        byBrand: Array.isArray(json.byBrand)
          ? json.byBrand
          : [],

        brands: Array.isArray(json.brands)
          ? json.brands
          : []
      };

      setData(safeData);
    } catch (err) {
      setData(null);
      setError(
        err instanceof Error
          ? err.message
          : "Erro desconhecido ao carregar o dashboard."
      );
    } finally {
      setLoading(false);
      setLoadingProgress(100);
      setLoadingExiting(true);
    }
  }

  useEffect(() => {
    load();
  }, [days, marca, mode]);

  useEffect(() => {
    if (!loading) {
      setLoadingProgress(100);
      return;
    }

    setLoadingProgress(14);
    const interval = window.setInterval(() => {
      setLoadingProgress(current => Math.min(current + 5, 92));
    }, 180);

    return () => window.clearInterval(interval);
  }, [loading]);

  useEffect(() => {
    if (loading || !loadingExiting) return;

    const timeout = window.setTimeout(() => {
      setLoadingExiting(false);
    }, 360);

    return () => window.clearTimeout(timeout);
  }, [loading, loadingExiting]);

  function addNotification(tone: NotificationItem["tone"], message: string) {
    const item: NotificationItem = {
      id: `${Date.now()}-${Math.random()}`,
      tone,
      message,
      createdAt: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    };
    setNotifications(current => [item, ...current].slice(0, 20));
    setToast({ tone, message });
  }

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function reprocessKey(row: HistoryRow) {
    return `${row.sku}::${row.dataHora}`;
  }

  async function reprocess(row: HistoryRow) {
    const key = reprocessKey(row);

    if (reprocessState[key] === "sending" || reprocessState[key] === "pending") {
      return;
    }

    setReprocessState(current => ({
      ...current,
      [key]: "sending"
    }));

    setToast(null);

    try {
      const response = await fetch(
        "/api/n8n/reprocess",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            sku: row.sku,
            titulo:
              row.tituloDepois ||
              row.tituloAntes,
            dataHora: row.dataHora
          })
        }
      );

      const json = await response.json().catch(() => null);

      if (!response.ok || !json?.ok) {
        throw new Error(
          json?.error ||
            `Falha ao reprocessar (HTTP ${response.status}).`
        );
      }

      if (json.completed === false) {
        setReprocessState(current => ({
          ...current,
          [key]: "pending"
        }));
        addNotification("success", "Produto aceito pelo n8n e aguardando conclusão das alterações.");
        return;
      }

      setReprocessState(current => ({
        ...current,
        [key]: "success"
      }));

      addNotification("success", json?.message || `SKU ${row.sku} enviado para reprocessamento.`);
    } catch (err) {
      setReprocessState(current => ({
        ...current,
        [key]: "error"
      }));

      addNotification("error", err instanceof Error ? err.message : "Falha ao enviar o produto para o n8n.");
    }
  }


  if (loading || loadingExiting) {
    return (
      <div className={`loading-screen ${loadingExiting ? "is-exiting" : ""}`} role="status" aria-live="polite">
        <div className="loading-card">
          <img
            className="loading-logo"
            src="/pitter-logo.svg"
            alt="Pitter Pan Festas"
          />
          <h1>Carregando dados da planilha...</h1>
          <div className="loading-progress-row">
            <div className="loading-progress" aria-hidden="true">
              <span
                className="loading-progress-fill"
                style={{ width: `${loadingProgress}%` }}
              />
            </div>
            <strong>{loadingProgress}%</strong>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <>
        <div className="page-head">
          <div>
            <h1 className="page-title">
              Erro ao carregar o dashboard
            </h1>

            <div className="page-sub">
              A interface está funcionando, mas a API não conseguiu ler a planilha.
            </div>
          </div>
        </div>

        <div
          className="panel"
          style={{
            borderColor: "#ffd2d7"
          }}
        >
          <div
            className="panel-title"
            style={{
              color: "#c41e2c"
            }}
          >
            Erro retornado pela API
          </div>

          <p
            style={{
              whiteSpace: "pre-wrap",
              lineHeight: 1.6
            }}
          >
            {error}
          </p>

          <button
            className="btn btn-primary"
            onClick={() => load(true)}
          >
            Tentar novamente
          </button>
        </div>
      </>
    );
  }

  if (!data) {
    return null;
  }

  const title =
    mode === "dashboard"
      ? "Dashboard"
      : mode === "products"
      ? "Produtos"
      : "Erros";

  return (
    <>
      {toast && (
        <div className={`integration-toast integration-toast-${toast.tone}`} role="status" aria-live="polite">
          {toast.tone === "success" ? (
            <CheckCircle2 size={18} />
          ) : (
            <AlertCircle size={18} />
          )}
          <span>{toast.message}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Fechar aviso">×</button>
        </div>
      )}

      <div className="page-head">
        <div>
          <h1 className="page-title">
            {title}
          </h1>

          <div className="page-sub">
            Automação de catálogo da Pitter Pan Festas
          </div>
        </div>

        <div className="head-actions">
          <div className="notification-center">
          <button className="notification-button" type="button" onClick={() => setNotificationsOpen(value => !value)} aria-label="Abrir notificações" aria-expanded={notificationsOpen}>
            <Bell size={17} />
            {notifications.length > 0 && <span className="notification-count">{notifications.length > 9 ? "9+" : notifications.length}</span>}
          </button>
          {notificationsOpen && (
            <div className="notification-panel">
              <div className="notification-panel-head"><strong>Notificações</strong><button type="button" onClick={() => setNotifications([])}>Limpar</button></div>
              {notifications.length === 0 ? <p className="notification-empty">Nenhum evento recente.</p> : notifications.map(item => (
                <div className={`notification-item notification-item-${item.tone}`} key={item.id}>
                  {item.tone === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  <span>{item.message}<small>{item.createdAt}</small></span>
                  <button type="button" aria-label="Remover notificação" onClick={() => setNotifications(current => current.filter(notification => notification.id !== item.id))}><X size={14} /></button>
                </div>
              ))}
            </div>
          )}
          </div>
          <button
            className="btn"
            onClick={() => load(true)}
          >
            <RefreshCw size={16} /> Atualizar
          </button>
        </div>
      </div>

      <div className="filters">
        <input
          className="control"
          placeholder="Buscar SKU, produto ou marca..."
          value={q}
          onChange={e =>
            setQ(e.target.value)
          }
        />

        <select
          className="control"
          value={marca}
          onChange={e =>
            setMarca(e.target.value)
          }
        >
          <option value="">
            Todas as marcas
          </option>

          {data.brands.map(brand => (
            <option
              key={brand}
              value={brand}
            >
              {brand}
            </option>
          ))}
        </select>

        <select
          className="control"
          value={days}
          onChange={e =>
            setDays(e.target.value)
          }
        >
          <option value="7">
            7 dias
          </option>
          <option value="30">
            30 dias
          </option>
          <option value="90">
            90 dias
          </option>
          <option value="3650">
            Tudo
          </option>
        </select>

        <button
          className="btn btn-primary"
          onClick={() => load()}
        >
          Aplicar filtros
        </button>
      </div>

      {mode === "dashboard" && (
        <>
          <section className="metrics">
            <Metric
              label="Produtos processados"
              value={data.metrics.total}
              comparison={data.metrics.comparisons.total}
              icon={PackageCheck}
            />
            <Metric
              label="Sucesso"
              value={data.metrics.sucesso}
              comparison={data.metrics.comparisons.sucesso}
              icon={CheckCircle2}
              tone="green"
            />
            <Metric
              label="Erros"
              value={data.metrics.erros}
              comparison={data.metrics.comparisons.erros}
              inverse
              icon={AlertCircle}
              tone="red"
            />
            <Metric
              label="Taxa de sucesso"
              value={`${data.metrics.taxaSucesso.toFixed(
                2
              )}%`}
              comparison={data.metrics.comparisons.taxaSucesso}
              icon={WandSparkles}
              tone="violet"
            />
            <Metric
              label="Tempo economizado"
              value={fmt(
                data.metrics
                  .tempoEconomizadoMin
              )}
              comparison={data.metrics.comparisons.tempoEconomizadoMin}
              icon={Clock3}
              tone="gold"
            />
          </section>

          <section className="metrics secondary bento-secondary">
            <Metric
              label="Títulos alterados"
              value={
                data.metrics
                  .titulosAlterados
              }
              comparison={data.metrics.comparisons.titulosAlterados}
              icon={WandSparkles}
            />
            <Metric
              label="Tags alteradas"
              value={
                data.metrics.tagsAlteradas
              }
              comparison={data.metrics.comparisons.tagsAlteradas}
              icon={Tags}
              tone="green"
            />
            <Metric
              label="Coleções alteradas"
              value={
                data.metrics
                  .colecoesAlteradas
              }
              comparison={data.metrics.comparisons.colecoesAlteradas}
              icon={PackageCheck}
              tone="gold"
            />
            <Metric
              label="Descrições geradas"
              value={
                data.metrics
                  .descricoesGeradas
              }
              comparison={data.metrics.comparisons.descricoesGeradas}
              icon={FileText}
              tone="violet"
            />
          </section>

          <section className="bento-grid">
            <div className="panel chart-panel">
              <div className="panel-head"><div><div className="eyebrow">Visão geral</div><div className="panel-title">
                Processamentos ao longo do tempo
              </div></div><select className="mini-select" defaultValue="diario"><option value="diario">Diário</option></select></div>

              <div
                style={{
                  height: 300
                }}
              >
                <ResponsiveContainer>
                  <LineChart
                    data={data.byDay}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#e8edf5"
                    />
                    <XAxis dataKey="data" />
                    <YAxis />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="sucesso"
                      stroke="#2f70ed"
                      strokeWidth={3}
                      dot={{ r: 3, fill: "#2f70ed", strokeWidth: 0 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="erros"
                      stroke="#ef5b62"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "#ef5b62", strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="panel brand-panel">
              <div className="panel-head"><div><div className="eyebrow">Catálogo</div><div className="panel-title">
                Distribuição por marca
              </div></div><select className="mini-select" defaultValue="top"><option value="top">Top 8</option></select></div>

              <div
                style={{
                  height: 300
                }}
              >
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={data.byBrand}
                      dataKey="total"
                      nameKey="marca"
                      innerRadius={72}
                      outerRadius={105}
                      paddingAngle={2}
                      cornerRadius={4}
                    >
                      {data.byBrand.map(
                        (_, index) => (
                          <Cell
                            key={index}
                            fill={
                              colors[
                                index %
                                  colors.length
                              ]
                            }
                          />
                        )
                      )}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>
        </>
      )}

      <section className={`panel ${mode === "dashboard" ? "latest-processings" : mode === "products" ? "products-list" : ""}`}>
        <div className="panel-head">
          <div className="panel-title">
            {mode === "errors"
              ? "Últimos erros"
              : "Últimos processamentos"}
          </div>

          <div className="metric-note">
            {data.rows.length} registros
          </div>
        </div>

        {data.rows.length === 0 ? (
          <div className="empty-results" role="status">
            <div className="empty-results-icon"><CheckCircle2 size={24} /></div>
            <strong>{mode === "errors" ? "Nenhum produto com erro" : "Nenhum produto encontrado"}</strong>
            <span>{mode === "errors" ? "Não há produtos com erro no período e filtros selecionados." : "Não há produtos para exibir no período e filtros selecionados."}</span>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
            <thead>
              <tr>
                <th>Data/Hora</th>
                <th>SKU</th>
                <th>Produto</th>
                <th>Marca</th>
                <th>Status</th>
                <th>Alterações</th>
                <th>Ação</th>
              </tr>
            </thead>

            <tbody>
              {data.rows
                .slice(
                  0,
                  mode === "dashboard"
                    ? 10
                    : 200
                )
                .map((row, index) => (
                  <tr
                    key={`${row.sku}-${index}`}
                  >
                    <td>
                      {row.dataHora}
                    </td>

                    <td>
                      <strong>
                        {row.sku}
                      </strong>
                    </td>

                    <td>
                      {row.tituloDepois ||
                        row.tituloAntes}
                    </td>

                    <td>
                      {row.marca || "—"}
                    </td>

                    <td>
                      <Badge
                        status={row.status}
                      />
                    </td>

                    <td>
                      {[
                        row.tituloAlterado &&
                          "Título",
                        row.tagsAlteradas &&
                          "Tags",
                        row.colecoesAlteradas &&
                          "Coleções",
                        row.descricaoGerada &&
                          "Descrição"
                      ]
                        .filter(Boolean)
                        .join(", ") ||
                        "Nenhuma"}
                    </td>

                    <td>
                      {(() => {
                        const state = reprocessState[reprocessKey(row)];

                        return (
                          <button
                            className={`btn reprocess-btn ${state ? `is-${state}` : ""}`}
                            disabled={state === "sending" || state === "pending" || state === "success"}
                            onClick={() => reprocess(row)}
                            title={
                              state === "error"
                                ? "Tentar enviar novamente"
                                : "Reprocessar produto no n8n"
                            }
                          >
                            {(state === "sending" || state === "pending") && <LoaderCircle className="spin" size={14} />}
                            {state === "success" && <CheckCircle2 size={14} />}
                            {state === "error" && <AlertCircle size={14} />}
                            {!state && <RefreshCw size={14} />}

                            {state === "sending" || state === "pending"
                              ? "Processando"
                              : state === "success"
                              ? "Enviado"
                              : state === "error"
                              ? "Tentar novamente"
                              : "Reprocessar"}
                          </button>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
            </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
