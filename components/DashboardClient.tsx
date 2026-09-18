"use client";

import { useEffect, useState } from "react";
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
  note
}: {
  label: string;
  value: string | number;
  note?: string;
}) => (
  <div className="metric-card">
    <div className="metric-label">{label}</div>
    <div className="metric-value">{value}</div>
    {note && <div className="metric-note">{note}</div>}
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
          tempoEconomizadoMin: 0
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
          ↻ Atualizar
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
            />
            <Metric
              label="Sucesso"
              value={data.metrics.sucesso}
            />
            <Metric
              label="Erros"
              value={data.metrics.erros}
            />
            <Metric
              label="Taxa de sucesso"
              value={`${data.metrics.taxaSucesso.toFixed(
                2
              )}%`}
            />
            <Metric
              label="Tempo economizado"
              value={fmt(
                data.metrics
                  .tempoEconomizadoMin
              )}
              note="estimativa"
            />
          </section>

          <section className="metrics secondary">
            <Metric
              label="Títulos alterados"
              value={
                data.metrics
                  .titulosAlterados
              }
            />
            <Metric
              label="Tags alteradas"
              value={
                data.metrics.tagsAlteradas
              }
            />
            <Metric
              label="Coleções alteradas"
              value={
                data.metrics
                  .colecoesAlteradas
              }
            />
            <Metric
              label="Descrições geradas"
              value={
                data.metrics
                  .descricoesGeradas
              }
            />
          </section>

          <section className="grid-2">
            <div className="panel">
              <div className="panel-title">
                Processamentos ao longo do tempo
              </div>

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
                    />
                    <XAxis dataKey="data" />
                    <YAxis />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="sucesso"
                      stroke="#233b8f"
                      strokeWidth={3}
                    />
                    <Line
                      type="monotone"
                      dataKey="erros"
                      stroke="#ef1f2f"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="panel">
              <div className="panel-title">
                Distribuição por marca
              </div>

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
