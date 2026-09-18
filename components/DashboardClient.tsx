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
import { AlertCircle, CheckCircle2, Clock3, FileText, PackageCheck, RefreshCw, Tags, WandSparkles } from "lucide-react";
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

  async function load(refresh = false) {
    setLoading(true);
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
    }
  }

  useEffect(() => {
    load();
  }, [days, marca, mode]);

  async function reprocess(row: HistoryRow) {
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
            row.tituloAntes
        })
      }
    );

    const json = await response.json();

    alert(
      json.ok
        ? "Enviado ao n8n."
        : json.error ||
            "Falha ao reprocessar."
    );
  }

  if (loading) {
    return (
      <div className="panel">
        Carregando dados da planilha...
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
      <div className="page-head">
        <div>
          <h1 className="page-title">
            {title}
          </h1>

          <div className="page-sub">
            Automação de catálogo da Pitter Pan Festas
          </div>
        </div>

        <button
          className="btn"
          onClick={() => load(true)}
        >
          <RefreshCw size={16} /> Atualizar
        </button>
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

      <section className="panel">
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
                      <button
                        className="btn"
                        onClick={() =>
                          reprocess(row)
                        }
                      >
                        Reprocessar
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
