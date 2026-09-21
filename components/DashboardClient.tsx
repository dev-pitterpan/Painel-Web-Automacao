"use client";

import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AreaChart,
  Area,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  Label,
} from "recharts";
import {
  AlertCircle,
  Bell,
  Box,
  CheckCircle2,
  Clock3,
  FileText,
  FolderOpen,
  LoaderCircle,
  Eye,
  ListChecks,
  ShieldCheck,
  Search,
  Tags,
  RefreshCw,
  RotateCcw,
  X,
} from "lucide-react";
import type { DashboardData, HistoryRow } from "@/lib/types";
import { calculateTimeSavedMinutes, parseHistoryDate } from "@/lib/metrics";
import { ProductDetailsDrawer } from "@/components/ProductDetailsDrawer";

const colors = [
  "#233b8f",
  "#ffd722",
  "#ef1f2f",
  "#16a36a",
  "#7b61ff",
  "#f5a623",
  "#4fb3df",
  "#9aa6bd",
];
const QUALITY_LABELS: Record<string, string> = {
  missingTitle: "Sem título",
  missingBrand: "Sem marca",
  missingTags: "Sem tags",
  missingCollection: "Sem coleção",
  missingSku: "Sem SKU",
  errors: "Com erro",
};

const fmt = (minutes: number) => {
  const totalMinutes = Math.floor(minutes);
  return `${Math.floor(totalMinutes / 60)}h ${String(totalMinutes % 60).padStart(2, "0")}m`;
};

const Badge = ({ status }: { status: string }) => (
  <span
    className={`badge status-indicator ${
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
  comparisonLabel = "mês anterior",
  inverse = false,
  icon: Icon,
  imageSrc,
  href,
  tone = "blue",
}: {
  label: string;
  value: string | number;
  note?: string;
  comparison?: number | null;
  comparisonLabel?: string;
  inverse?: boolean;
  icon?: LucideIcon;
  imageSrc?: string;
  href?: string;
  tone?: "blue" | "green" | "red" | "gold" | "violet";
}) => {
  const roundedComparison =
    comparison === null || comparison === undefined
      ? comparison
      : Math.round(comparison);
  const normalizedComparison = Object.is(roundedComparison, -0)
    ? 0
    : roundedComparison;
  return (
    <div
      className={`metric-card metric-${tone} ${href ? "is-clickable" : ""}`}
      role={href ? "link" : undefined}
      tabIndex={href ? 0 : undefined}
      onClick={() => href && window.location.assign(href)}
      onKeyDown={(event) => {
        if (href && (event.key === "Enter" || event.key === " "))
          window.location.assign(href);
      }}
    >
      <div className="metric-top">
        <span className="metric-icon">
          {imageSrc ? (
            <img src={imageSrc} alt="" aria-hidden="true" />
          ) : Icon ? (
            <Icon size={17} />
          ) : null}
        </span>
        <div className="metric-label">{label}</div>
      </div>
      <div className="metric-bottom">
        <div className="metric-value">{value}</div>
        {comparison !== undefined && (
          <div className="metric-change-wrap">
            <div
              className={`metric-comparison ${comparison === null || normalizedComparison === 0 ? "is-neutral" : normalizedComparison! >= 0 !== inverse ? "is-positive" : "is-negative"}`}
            >
              {comparison === null ? (
                <span title="Não existem registros no período escolhido para comparação.">
                  Sem base <span aria-hidden="true">ⓘ</span>
                </span>
              ) : (
                `${normalizedComparison === 0 ? "→" : normalizedComparison! > 0 ? "↑" : "↓"} ${normalizedComparison! > 0 ? "+" : ""}${normalizedComparison}%`
              )}
            </div>
            {comparison !== null && (
              <span className="metric-previous">vs. {comparisonLabel}</span>
            )}
          </div>
        )}
        {note && <div className="metric-note">{note}</div>}
      </div>
    </div>
  );
};

type TimeGrouping = "daily" | "weekly";

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function buildTimeSeries(rows: HistoryRow[], grouping: TimeGrouping) {
  const grouped = new Map<
    string,
    { sortKey: number; data: string; sucesso: number; erros: number }
  >();

  rows.forEach((row) => {
    const parsed = parseHistoryDate(row.dataHora);
    if (!parsed) return;

    let bucket = new Date(parsed);
    let key = "";
    let label = "";

    if (grouping === "weekly") {
      const day = bucket.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      bucket.setDate(bucket.getDate() + diff);
      bucket.setHours(0, 0, 0, 0);

      const end = new Date(bucket);
      end.setDate(end.getDate() + 6);

      key = `week-${bucket.getFullYear()}-${bucket.getMonth()}-${bucket.getDate()}`;
      label = `${formatShortDate(bucket)}–${formatShortDate(end)}`;
    } else {
      bucket.setHours(0, 0, 0, 0);
      key = `day-${bucket.getFullYear()}-${bucket.getMonth()}-${bucket.getDate()}`;
      label = formatShortDate(bucket);
    }

    const current = grouped.get(key) || {
      sortKey: bucket.getTime(),
      data: label,
      sucesso: 0,
      erros: 0,
    };

    if (
      String(row.status || "")
        .toLowerCase()
        .startsWith("erro")
    ) {
      current.erros += 1;
    } else {
      current.sucesso += 1;
    }

    grouped.set(key, current);
  });

  return [...grouped.values()]
    .sort((a, b) => a.sortKey - b.sortKey)
    .map(({ sortKey: _sortKey, ...item }) => {
      const total = item.sucesso + item.erros;
      return {
        ...item,
        total,
        taxa: total ? (item.sucesso / total) * 100 : 0,
        tempo: calculateTimeSavedMinutes(total),
      };
    });
}

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
  mode = "dashboard",
}: {
  mode?: "dashboard" | "products" | "errors";
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [marca, setMarca] = useState("");
  const [days, setDays] = useState("30");
  const [month, setMonth] = useState("all");
  const [compareMonth, setCompareMonth] = useState("");
  const [qualityFilter, setQualityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [timeGrouping, setTimeGrouping] = useState<TimeGrouping>("daily");
  const [brandTop, setBrandTop] = useState(5);
  const [loadingProgress, setLoadingProgress] = useState(14);
  const [loadingExiting, setLoadingExiting] = useState(false);
  const [reprocessState, setReprocessState] = useState<
    Record<string, "sending" | "pending" | "success" | "error">
  >({});
  const [toast, setToast] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [filterVersion, setFilterVersion] = useState(0);
  const [selectedProduct, setSelectedProduct] = useState<HistoryRow | null>(
    null,
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQualityFilter(params.get("quality") || "");
    setStatusFilter(params.get("status") || "");
  }, []);

  const timeSeriesData = useMemo(
    () => buildTimeSeries(data?.rows || [], timeGrouping),
    [data, timeGrouping],
  );

  const brandChartData = useMemo(
    () => (data?.byBrand || []).slice(0, brandTop),
    [data, brandTop],
  );
  const catalogQuality = useMemo(() => {
    const products = new Map<string, HistoryRow>();
    (data?.rows || []).forEach((row) => {
      const key = String(row.sku || row.tituloDepois || row.tituloAntes).trim();
      if (key && !products.has(key)) products.set(key, row);
    });
    const rows = [...products.values()];
    const issues = [
      {
        key: "missingTitle",
        label: "Sem título",
        count: rows.filter(
          (row) => !String(row.tituloDepois || row.tituloAntes).trim(),
        ).length,
        icon: FileText,
        tone: "blue",
        weight: 25,
      },
      {
        key: "missingBrand",
        label: "Sem marca",
        count: rows.filter((row) => !String(row.marca).trim()).length,
        icon: Box,
        tone: "red",
        weight: 20,
      },
      {
        key: "missingTags",
        label: "Sem tags",
        count: rows.filter(
          (row) => !String(row.tagsDepois || row.tagsAntes).trim(),
        ).length,
        icon: Tags,
        tone: "gold",
        weight: 15,
      },
      {
        key: "missingCollection",
        label: "Sem coleção",
        count: rows.filter(
          (row) => !String(row.colecoesDepois || row.colecoesAntes).trim(),
        ).length,
        icon: FolderOpen,
        tone: "violet",
        weight: 15,
      },
      {
        key: "missingSku",
        label: "Sem SKU",
        count: rows.filter((row) => !String(row.sku).trim()).length,
        icon: Box,
        tone: "red",
        weight: 15,
      },
      {
        key: "errors",
        label: "Com erro",
        count: rows.filter((row) =>
          String(row.status).toLowerCase().startsWith("erro"),
        ).length,
        icon: AlertCircle,
        tone: "red",
        weight: 10,
      },
    ];
    const lostPoints = issues.reduce(
      (sum, item) =>
        sum + (rows.length ? (item.count / rows.length) * item.weight : 0),
      0,
    );
    return {
      total: rows.length,
      issues,
      score: rows.length ? Math.max(0, 100 - lostPoints) : 100,
    };
  }, [data]);
  const monthOptions = useMemo(
    () => [
      { value: "all", label: "Período completo" },
      ...Array.from({ length: 24 }, (_, index) => {
        const date = new Date();
        date.setDate(1);
        date.setMonth(date.getMonth() - index);
        const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        const rawLabel = new Intl.DateTimeFormat("pt-BR", {
          month: "long",
          year: "numeric",
        }).format(date);
        return {
          value,
          label: rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1),
        };
      }),
    ],
    [],
  );

  async function load(refresh = false) {
    setLoading(true);
    setLoadingExiting(false);
    setError("");

    try {
      const p = new URLSearchParams({
        days,
        q,
        marca,
      });

      if (mode === "dashboard") p.set("month", month);
      if (mode === "dashboard" && compareMonth)
        p.set("compareMonth", compareMonth);
      if (qualityFilter) p.set("quality", qualityFilter);

      if (mode === "errors") {
        p.set("status", "erro");
      } else if (statusFilter) {
        p.set("status", statusFilter);
      }

      if (refresh) {
        p.set("refresh", "1");
      }

      const response = await fetch(`/api/dashboard?${p.toString()}`, {
        cache: "no-store",
      });

      const json = (await response.json()) as DashboardData & ApiError;

      if (!response.ok || json?.error) {
        throw new Error(json?.error || `Erro HTTP ${response.status}`);
      }

      // Proteção adicional contra resposta incompleta
      const safeData: DashboardData = {
        rows: Array.isArray(json.rows) ? json.rows : [],

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
            tempoEconomizadoMin: null,
          },
        },

        byDay: Array.isArray(json.byDay) ? json.byDay : [],

        byBrand: Array.isArray(json.byBrand) ? json.byBrand : [],

        brands: Array.isArray(json.brands) ? json.brands : [],
        source: json.source,
        comparison: json.comparison || {
          available: false,
          label: "período anterior",
        },
      };

      setData(safeData);
    } catch (err) {
      setData(null);
      setError(
        err instanceof Error
          ? err.message
          : "Erro desconhecido ao carregar o dashboard.",
      );
    } finally {
      setLoading(false);
      setLoadingProgress(100);
      setLoadingExiting(true);
    }
  }

  useEffect(() => {
    load();
  }, [
    days,
    month,
    compareMonth,
    marca,
    qualityFilter,
    statusFilter,
    mode,
    filterVersion,
  ]);

  const hasActiveFilters = Boolean(
    q ||
    marca ||
    qualityFilter ||
    compareMonth ||
    (mode === "dashboard" ? month !== "all" : days !== "30"),
  );

  function resetFilters() {
    setQ("");
    setMarca("");
    setDays("30");
    setMonth("all");
    setCompareMonth("");
    setQualityFilter("");
    setFilterVersion((value) => value + 1);
  }

  useEffect(() => {
    if (!loading) {
      setLoadingProgress(100);
      return;
    }

    setLoadingProgress(14);
    const interval = window.setInterval(() => {
      setLoadingProgress((current) => Math.min(current + 5, 92));
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
      createdAt: new Date().toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
    setNotifications((current) => [item, ...current].slice(0, 20));
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

    if (
      reprocessState[key] === "sending" ||
      reprocessState[key] === "pending"
    ) {
      return;
    }

    setReprocessState((current) => ({
      ...current,
      [key]: "sending",
    }));

    setToast(null);

    try {
      const response = await fetch("/api/n8n/reprocess", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sku: row.sku,
          titulo: row.tituloDepois || row.tituloAntes,
          dataHora: row.dataHora,
        }),
      });

      const json = await response.json().catch(() => null);

      if (!response.ok || !json?.ok) {
        throw new Error(
          json?.error || `Falha ao reprocessar (HTTP ${response.status}).`,
        );
      }

      if (json.completed === false) {
        setReprocessState((current) => ({
          ...current,
          [key]: "pending",
        }));
        addNotification(
          "success",
          "Produto aceito pelo n8n. Aguardando a conclusão da execução...",
        );

        const maxAttempts = 120;
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 3000));
          const statusResponse = await fetch(
            `/api/n8n/reprocess/status?request_id=${encodeURIComponent(json.requestId)}`,
            {
              cache: "no-store",
            },
          );
          const statusJson = await statusResponse.json().catch(() => null);
          if (!statusResponse.ok)
            throw new Error(
              statusJson?.error ||
                "Não foi possível consultar o status do reprocessamento.",
            );
          if (statusJson?.completed) {
            setReprocessState((current) => ({ ...current, [key]: "success" }));
            addNotification(
              "success",
              "Reprocessamento concluído. As informações atualizadas já foram salvas.",
            );
            return;
          }
        }

        throw new Error(
          "O n8n ainda não concluiu o processamento. Atualize a página para consultar novamente.",
        );
      }

      setReprocessState((current) => ({
        ...current,
        [key]: "success",
      }));

      addNotification(
        "success",
        json?.message || `SKU ${row.sku} reprocessado com sucesso.`,
      );
    } catch (err) {
      setReprocessState((current) => ({
        ...current,
        [key]: "error",
      }));

      addNotification(
        "error",
        err instanceof Error
          ? err.message
          : "Falha ao enviar o produto para o n8n.",
      );
    }
  }

  if (loading || loadingExiting) {
    return (
      <div
        className={`loading-screen ${loadingExiting ? "is-exiting" : ""}`}
        role="status"
        aria-live="polite"
      >
        <div className="loading-card">
          <img
            className="loading-logo"
            src="/favicon.svg"
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
            <h1 className="page-title">Erro ao carregar o dashboard</h1>

            <div className="page-sub">
              A interface está funcionando, mas a API não conseguiu ler a
              planilha.
            </div>
          </div>
        </div>

        <div
          className="panel"
          style={{
            borderColor: "#ffd2d7",
          }}
        >
          <div
            className="panel-title"
            style={{
              color: "#c41e2c",
            }}
          >
            Erro retornado pela API
          </div>

          <p
            style={{
              whiteSpace: "pre-wrap",
              lineHeight: 1.6,
            }}
          >
            {error}
          </p>

          <button className="btn btn-primary" onClick={() => load(true)}>
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
      <ProductDetailsDrawer
        row={selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />
      {toast && (
        <div
          className={`integration-toast integration-toast-${toast.tone}`}
          role="status"
          aria-live="polite"
        >
          {toast.tone === "success" ? (
            <CheckCircle2 size={18} />
          ) : (
            <AlertCircle size={18} />
          )}
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Fechar aviso"
          >
            ×
          </button>
        </div>
      )}

      <form
        className="dashboard-topbar"
        onSubmit={(event) => {
          event.preventDefault();
          load();
        }}
      >
        <div className="topbar-search">
          <Search size={18} aria-hidden="true" />
          <input
            placeholder="Buscar produtos, SKUs ou marcas..."
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
        </div>
        <select
          className="topbar-period"
          value={mode === "dashboard" ? month : days}
          onChange={(event) =>
            mode === "dashboard"
              ? setMonth(event.target.value)
              : setDays(event.target.value)
          }
          aria-label={mode === "dashboard" ? "Período do dashboard" : "Período"}
        >
          {mode === "dashboard" ? (
            monthOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))
          ) : (
            <>
              <option value="7">7 dias</option>
              <option value="30">30 dias</option>
              <option value="90">90 dias</option>
              <option value="3650">Tudo</option>
            </>
          )}
        </select>
        {mode === "dashboard" && (
          <select
            className="topbar-compare"
            value={compareMonth}
            onChange={(event) => setCompareMonth(event.target.value)}
            disabled={month === "all"}
            aria-label="Mês usado na comparação"
          >
            <option value="">Comparar: mês anterior</option>
            {monthOptions
              .filter(
                (option) => option.value !== "all" && option.value !== month,
              )
              .map((option) => (
                <option key={option.value} value={option.value}>
                  Comparar com {option.label}
                </option>
              ))}
          </select>
        )}
        <select
          className="topbar-brand"
          value={marca}
          onChange={(event) => setMarca(event.target.value)}
          aria-label="Marca"
        >
          <option value="">Todas as marcas</option>
          {data.brands.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <button className="topbar-submit" type="submit">
          Aplicar
        </button>
        {hasActiveFilters && (
          <button className="topbar-reset" type="button" onClick={resetFilters}>
            <RotateCcw size={14} />
            Resetar
          </button>
        )}
        {mode === "dashboard" && data.source && (
          <div className="topbar-sheet">
            <span className="sheets-icon">
              <img src="/icons/google-sheets.png" alt="" />
            </span>
            <span>
              <strong>Google Sheets</strong>
              <small>
                <i />
                Conectado
              </small>
            </span>
          </div>
        )}
        {mode === "dashboard" && data.source && (
          <div className="topbar-sync">
            <RefreshCw size={16} />
            <span>
              Última sincronização
              <strong>
                {new Date(data.source.lastSyncedAt).toLocaleString("pt-BR")}
              </strong>
            </span>
          </div>
        )}
        <div className="head-actions topbar-actions">
          <div className="notification-center">
            <button
              className="notification-button"
              type="button"
              onClick={() => setNotificationsOpen((value) => !value)}
              aria-label="Abrir notificações"
              aria-expanded={notificationsOpen}
            >
              <Bell size={17} />
              {notifications.length > 0 && (
                <span className="notification-count">
                  {notifications.length > 9 ? "9+" : notifications.length}
                </span>
              )}
            </button>
            {notificationsOpen && (
              <div className="notification-panel">
                <div className="notification-panel-head">
                  <strong>Notificações</strong>
                  <button type="button" onClick={() => setNotifications([])}>
                    Limpar
                  </button>
                </div>
                {notifications.length === 0 ? (
                  <p className="notification-empty">Nenhum evento recente.</p>
                ) : (
                  notifications.map((item) => (
                    <div
                      className={`notification-item notification-item-${item.tone}`}
                      key={item.id}
                    >
                      {item.tone === "success" ? (
                        <CheckCircle2 size={16} />
                      ) : (
                        <AlertCircle size={16} />
                      )}
                      <span>
                        {item.message}
                        <small>{item.createdAt}</small>
                      </span>
                      <button
                        type="button"
                        aria-label="Remover notificação"
                        onClick={() =>
                          setNotifications((current) =>
                            current.filter(
                              (notification) => notification.id !== item.id,
                            ),
                          )
                        }
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          <button className="btn" type="button" onClick={() => load(true)}>
            <RefreshCw size={16} />
            <span>Atualizar</span>
          </button>
        </div>
      </form>

      <div className="page-head dashboard-title-row">
        <div>
          <h1 className="page-title">{title}</h1>
          <div className="page-sub">Automação de catálogo</div>
        </div>
      </div>
      {qualityFilter && (
        <div className="active-quality-filter">
          <ListChecks size={15} />
          <span>
            Filtro de qualidade ativo:{" "}
            <b>{QUALITY_LABELS[qualityFilter] || qualityFilter}</b>
          </span>
          <button type="button" onClick={() => setQualityFilter("")}>
            <X size={14} />
            Limpar
          </button>
        </div>
      )}

      {mode === "dashboard" && data.rows.length === 0 && (
        <section
          className="dashboard-empty-period"
          role="status"
          aria-live="polite"
        >
          <img src="/favicon.svg" alt="Pitter Pan Festas" />
          <h2>Não há registros para este período</h2>
          <p>
            Nenhum produto foi encontrado no mês selecionado. Escolha outro mês
            para visualizar os dados.
          </p>
        </section>
      )}

      {mode === "dashboard" && data.rows.length > 0 && (
        <>
          <section className="metrics">
            <Metric
              label="Produtos processados"
              value={data.metrics.total}
              comparison={data.metrics.comparisons.total}
              comparisonLabel={data.comparison.label}
              imageSrc="/icons/entregavel.png"
              href="/produtos"
            />
            <Metric
              label="Sucesso"
              value={data.metrics.sucesso}
              comparison={data.metrics.comparisons.sucesso}
              comparisonLabel={data.comparison.label}
              imageSrc="/icons/verificar.png"
              href="/produtos?status=sucesso"
              tone="green"
            />
            <Metric
              label="Erros"
              value={data.metrics.erros}
              comparison={data.metrics.comparisons.erros}
              comparisonLabel={data.comparison.label}
              inverse
              imageSrc="/icons/botao-x.png"
              href="/erros"
              tone="red"
            />
            <Metric
              label="Taxa de sucesso"
              value={`${data.metrics.taxaSucesso.toFixed(2)}%`}
              comparison={data.metrics.comparisons.taxaSucesso}
              comparisonLabel={data.comparison.label}
              imageSrc="/icons/percentagem.png"
              tone="violet"
            />
            <Metric
              label="Tempo economizado"
              value={fmt(data.metrics.tempoEconomizadoMin)}
              comparison={data.metrics.comparisons.tempoEconomizadoMin}
              comparisonLabel={data.comparison.label}
              imageSrc="/icons/relogio.png"
              href="/relatorios"
              tone="gold"
            />
          </section>

          <section className="bento-grid">
            <div className="panel chart-panel">
              <div className="panel-head">
                <div>
                  <div className="eyebrow">Visão geral</div>
                  <div className="panel-title">
                    Processamentos ao longo do tempo
                  </div>
                </div>
                <select
                  className="mini-select"
                  value={timeGrouping}
                  onChange={(e) =>
                    setTimeGrouping(e.target.value as TimeGrouping)
                  }
                  aria-label="Agrupar processamentos por período"
                >
                  <option value="daily">Diário</option>
                  <option value="weekly">Semanal</option>
                </select>
              </div>

              <div
                style={{
                  height: 300,
                }}
              >
                <ResponsiveContainer>
                  <AreaChart data={timeSeriesData}>
                    <defs>
                      <linearGradient
                        id="successArea"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#2f70ed"
                          stopOpacity={0.24}
                        />
                        <stop
                          offset="100%"
                          stopColor="#2f70ed"
                          stopOpacity={0.02}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#e8edf5"
                    />
                    <XAxis
                      dataKey="data"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#758198", fontSize: 10 }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#758198", fontSize: 10 }}
                    />
                    <Tooltip
                      contentStyle={{
                        border: "1px solid #e6ebf3",
                        borderRadius: 10,
                        boxShadow: "0 12px 30px rgba(20,39,78,.12)",
                        fontSize: 11,
                      }}
                      cursor={{ stroke: "#b9c9e8", strokeDasharray: "4 4" }}
                      formatter={(
                        value: number,
                        name: string,
                        item: {
                          payload?: {
                            total?: number;
                            taxa?: number;
                            tempo?: number;
                          };
                        },
                      ) =>
                        name === "sucesso"
                          ? [value.toLocaleString("pt-BR"), "Sucessos"]
                          : [value.toLocaleString("pt-BR"), "Erros"]
                      }
                      labelFormatter={(label, payload) => {
                        const point = payload?.[0]?.payload;
                        return `${label} · ${point?.total || 0} processamentos · ${(point?.taxa || 0).toFixed(1)}% de sucesso · ${fmt(point?.tempo || 0)} economizados`;
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="sucesso"
                      stroke="#2f70ed"
                      strokeWidth={3}
                      fill="url(#successArea)"
                      dot={{ r: 3, fill: "#2f70ed", strokeWidth: 0 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="erros"
                      stroke="#ef5b62"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "#ef5b62", strokeWidth: 0 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="panel brand-panel">
              <div className="panel-head">
                <div>
                  <div className="eyebrow">Catálogo</div>
                  <div className="panel-title">Distribuição por marca</div>
                </div>
                <select
                  className="mini-select"
                  value={String(brandTop)}
                  onChange={(e) => setBrandTop(Number(e.target.value))}
                  aria-label="Quantidade de marcas no ranking"
                >
                  <option value="3">Top 3</option>
                  <option value="5">Top 5</option>
                  <option value="10">Top 10</option>
                  <option value="20">Top 20</option>
                </select>
              </div>

              <div
                style={{
                  height: 300,
                }}
              >
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={brandChartData}
                      dataKey="total"
                      nameKey="marca"
                      innerRadius={72}
                      outerRadius={105}
                      paddingAngle={2}
                      cornerRadius={4}
                      onClick={(entry) => {
                        if (entry?.marca) {
                          setMarca(String(entry.marca));
                          setFilterVersion((value) => value + 1);
                        }
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      <Label
                        value={data.metrics.total.toLocaleString("pt-BR")}
                        position="center"
                        className="donut-total"
                      />
                      {brandChartData.map((_, index) => (
                        <Cell
                          key={index}
                          fill={colors[index % colors.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        border: "1px solid #e6ebf3",
                        borderRadius: 10,
                        boxShadow: "0 12px 30px rgba(20,39,78,.12)",
                        fontSize: 11,
                      }}
                      formatter={(
                        value: number,
                        _name: string,
                        item: { payload?: { marca?: string } },
                      ) => [
                        `${value.toLocaleString("pt-BR")} (${data.metrics.total ? ((value / data.metrics.total) * 100).toFixed(1) : "0.0"}%)`,
                        item.payload?.marca || "Marca",
                      ]}
                    />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: 11 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          <section className="dashboard-operations-grid">
            <section className="panel catalog-quality">
              <div className="panel-head">
                <div>
                  <div className="eyebrow">Consistência dos dados</div>
                  <div className="panel-title">
                    <ListChecks size={16} />
                    Qualidade do catálogo
                  </div>
                </div>
                <div
                  className={`quality-score ${catalogQuality.score < (data.source?.qualityTarget || 95) ? "is-below-target" : ""}`}
                >
                  <ShieldCheck size={17} />
                  <span>
                    <strong>{catalogQuality.score.toFixed(1)}%</strong>
                    <small>meta {data.source?.qualityTarget || 95}%</small>
                  </span>
                </div>
              </div>
              <div
                className="quality-progress"
                aria-label={`Qualidade do catálogo: ${catalogQuality.score}%`}
              >
                <span style={{ width: `${catalogQuality.score}%` }} />
              </div>
              <div className="quality-indicators">
                {catalogQuality.issues.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      type="button"
                      className={`quality-item tone-${item.tone}`}
                      key={item.label}
                      onClick={() =>
                        window.location.assign(`/produtos?quality=${item.key}`)
                      }
                      title={`Ver produtos: ${item.label.toLowerCase()}`}
                    >
                      <span>
                        <Icon size={17} />
                      </span>
                      <div>
                        <strong>{item.count.toLocaleString("pt-BR")}</strong>
                        <small>{item.label}</small>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="quality-summary">
                <span>
                  <b>{catalogQuality.total.toLocaleString("pt-BR")}</b> produtos
                  únicos avaliados
                </span>
                <span>
                  <b>{data.metrics.titulosAlterados.toLocaleString("pt-BR")}</b>{" "}
                  títulos ·{" "}
                  <b>{data.metrics.tagsAlteradas.toLocaleString("pt-BR")}</b>{" "}
                  tags ·{" "}
                  <b>
                    {data.metrics.colecoesAlteradas.toLocaleString("pt-BR")}
                  </b>{" "}
                  coleções alteradas
                </span>
              </div>
            </section>
          </section>
        </>
      )}

      {!(mode === "dashboard" && data.rows.length === 0) && (
        <section
          className={`panel ${mode === "dashboard" ? "latest-processings" : mode === "products" ? "products-list" : ""}`}
        >
          <div className="panel-head">
            <div className="panel-title">
              {mode === "errors" ? "Últimos erros" : "Últimos processamentos"}
            </div>

            <div className="metric-note">{data.rows.length} registros</div>
          </div>

          {data.rows.length === 0 ? (
            <div className="empty-results" role="status">
              <div className="empty-results-icon">
                <CheckCircle2 size={24} />
              </div>
              <strong>
                {mode === "errors"
                  ? "Nenhum produto com erro"
                  : "Nenhum produto encontrado"}
              </strong>
              <span>
                {mode === "errors"
                  ? "Não há produtos com erro no período e filtros selecionados."
                  : "Não há produtos para exibir no período e filtros selecionados."}
              </span>
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
                    .slice(0, mode === "dashboard" ? 10 : 200)
                    .map((row, index) => (
                      <tr key={`${row.sku}-${index}`}>
                        <td>{row.dataHora}</td>

                        <td>
                          <strong>{row.sku}</strong>
                        </td>

                        <td>
                          <button
                            className="product-link"
                            type="button"
                            onClick={() => setSelectedProduct(row)}
                          >
                            {row.tituloDepois ||
                              row.tituloAntes ||
                              "Produto sem título"}
                          </button>
                        </td>

                        <td>{row.marca || "—"}</td>

                        <td>
                          <Badge status={row.status} />
                        </td>

                        <td>
                          {[
                            row.tituloAlterado && "Título",
                            row.tagsAlteradas && "Tags",
                            row.colecoesAlteradas && "Coleções",
                            row.descricaoGerada && "Descrição",
                          ]
                            .filter(Boolean)
                            .join(", ") || "Nenhuma"}
                        </td>

                        <td>
                          {(() => {
                            const state = reprocessState[reprocessKey(row)];

                            return (
                              <div className="row-actions">
                                <button
                                  className="btn details-btn"
                                  type="button"
                                  onClick={() => setSelectedProduct(row)}
                                  title="Ver valores antes e depois"
                                >
                                  <Eye size={14} />
                                  Detalhes
                                </button>
                                <button
                                  className={`btn reprocess-btn ${state ? `is-${state}` : ""}`}
                                  disabled={
                                    state === "sending" ||
                                    state === "pending" ||
                                    state === "success"
                                  }
                                  onClick={() => reprocess(row)}
                                  title={
                                    state === "error"
                                      ? "Tentar enviar novamente"
                                      : "Reprocessar produto no n8n"
                                  }
                                >
                                  {(state === "sending" ||
                                    state === "pending") && (
                                    <LoaderCircle className="spin" size={14} />
                                  )}
                                  {state === "success" && (
                                    <CheckCircle2 size={14} />
                                  )}
                                  {state === "error" && (
                                    <AlertCircle size={14} />
                                  )}
                                  {!state && <RefreshCw size={14} />}

                                  {state === "sending" || state === "pending"
                                    ? "Processando"
                                    : state === "success"
                                      ? "Enviado"
                                      : state === "error"
                                        ? "Tentar novamente"
                                        : "Reprocessar"}
                                </button>
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
          {mode === "dashboard" && data.rows.length > 0 && (
            <div className="latest-processings-footer">
              <button type="button" className="btn" onClick={() => window.location.assign("/produtos")}>
                Ver todos os produtos
              </button>
            </div>
          )}
        </section>
      )}
    </>
  );
}
