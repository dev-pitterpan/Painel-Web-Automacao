"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Box,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  RefreshCw,
  TrendingUp,
  XCircle,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
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
  "#9aa6bd",
];
const fmt = (m: number) =>
  `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}min`;
const isBrand = (v: string) => /\p{L}/u.test(String(v || "").trim());
function parseDate(value: string) {
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d;
  const m = String(value || "").match(
    /^(\d{2})\/(\d{2})\/(\d{4}),?\s*(\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!m) return null;
  const [, dd, mm, yy, h, mi, s = "00"] = m;
  return new Date(`${yy}-${mm}-${dd}T${h}:${mi}:${s}-03:00`);
}
function pct(c: number, p: number) {
  return p === 0 ? null : ((c - p) / p) * 100;
}
function metrics(rows: HistoryRow[]) {
  const sucesso = rows.filter(
    (r) => !String(r.status).toLowerCase().startsWith("erro"),
  ).length;
  const erros = rows.length - sucesso;
  return {
    total: rows.length,
    sucesso,
    erros,
    taxa: rows.length ? (sucesso / rows.length) * 100 : 0,
    tempo: Math.round((rows.length * 48) / 60),
  };
}
function csvEscape(v: unknown) {
  const s = String(v ?? "");
  return `"${s.replaceAll('"', '""')}"`;
}

type Generated = {
  id: string;
  createdAt: string;
  periodo: string;
  filtros: string;
  formato: string;
  status: string;
};
export function ReportsClient() {
  const [all, setAll] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [start, setStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return d.toISOString().slice(0, 10);
  });
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [brand, setBrand] = useState("");
  const [status, setStatus] = useState("");
  const [applied, setApplied] = useState({
    start: "",
    end: "",
    brand: "",
    status: "",
  });
  const [generated, setGenerated] = useState<Generated[]>([]);
  async function load(refresh = false) {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(
        `/api/dashboard?days=3650${refresh ? "&refresh=1" : ""}`,
        { cache: "no-store" },
      );
      const j = (await r.json()) as DashboardData & { error?: string };
      if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
      setAll(Array.isArray(j.rows) ? j.rows : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar relatórios.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    const raw = localStorage.getItem("pitter-report-history");
    if (raw) {
      try {
        setGenerated(JSON.parse(raw));
      } catch {}
    }
  }, []);
  useEffect(() => {
    if (!applied.start && all.length) setApplied({ start, end, brand, status });
  }, [all]);
  const brands = useMemo(
    () =>
      [
        ...new Set(
          all.map((r) => String(r.marca || "").trim()).filter(isBrand),
        ),
      ].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [all],
  );
  const rows = useMemo(() => {
    const s = new Date(`${applied.start || start}T00:00:00-03:00`).getTime();
    const e = new Date(`${applied.end || end}T23:59:59-03:00`).getTime();
    return all.filter((r) => {
      const d = parseDate(r.dataHora);
      if (!d) return false;
      if (d.getTime() < s || d.getTime() > e) return false;
      if (applied.brand && r.marca !== applied.brand) return false;
      const err = String(r.status).toLowerCase().startsWith("erro");
      if (applied.status === "sucesso" && err) return false;
      if (applied.status === "erro" && !err) return false;
      return true;
    });
  }, [all, applied, start, end]);
  const current = useMemo(() => metrics(rows), [rows]);
  const previous = useMemo(() => {
    const s = new Date(`${applied.start || start}T00:00:00-03:00`);
    const e = new Date(`${applied.end || end}T23:59:59-03:00`);
    const span = e.getTime() - s.getTime() + 1;
    const ps = new Date(s.getTime() - span),
      pe = new Date(s.getTime() - 1);
    const prev = all.filter((r) => {
      const d = parseDate(r.dataHora);
      if (!d || d.getTime() < ps.getTime() || d.getTime() > pe.getTime())
        return false;
      if (applied.brand && r.marca !== applied.brand) return false;
      const err = String(r.status).toLowerCase().startsWith("erro");
      if (applied.status === "sucesso" && err) return false;
      if (applied.status === "erro" && !err) return false;
      return true;
    });
    return metrics(prev);
  }, [all, applied, start, end]);
  const byDay = useMemo(() => {
    const m = new Map<string, { data: string; total: number; sort: number }>();
    rows.forEach((r) => {
      const d = parseDate(r.dataHora);
      if (!d) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const label = new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      }).format(d);
      const x = m.get(key) || {
        data: label,
        total: 0,
        sort: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(),
      };
      x.total++;
      m.set(key, x);
    });
    return [...m.values()]
      .sort((a, b) => a.sort - b.sort)
      .map(({ sort, ...item }) => item);
  }, [rows]);
  const byBrand = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => {
      const b = String(r.marca || "").trim();
      if (isBrand(b)) m.set(b, (m.get(b) || 0) + 1);
    });
    return [...m.entries()]
      .map(([marca, total]) => ({ marca, total }))
      .sort((a, b) => b.total - a.total);
  }, [rows]);
  function apply() {
    setApplied({ start, end, brand, status });
    const item: Generated = {
      id: crypto.randomUUID(),
      createdAt: new Date().toLocaleString("pt-BR"),
      periodo: `${start.split("-").reverse().join("/")} - ${end.split("-").reverse().join("/")}`,
      filtros: [
        brand || "Todas as marcas",
        status === "erro"
          ? "Erros"
          : status === "sucesso"
            ? "Sucesso"
            : "Todos os status",
      ].join(" • "),
      formato: "CSV",
      status: "Concluído",
    };
    const next = [item, ...generated].slice(0, 8);
    setGenerated(next);
    localStorage.setItem("pitter-report-history", JSON.stringify(next));
  }
  function exportCsv() {
    const headers = [
      "Data/Hora",
      "SKU",
      "Produto",
      "Marca",
      "Status",
      "Título Alterado?",
      "Tags Alteradas?",
      "Coleções Alteradas?",
      "Descrição Gerada?",
    ];
    const lines = [
      headers.join(";"),
      ...rows.map((r) =>
        [
          r.dataHora,
          r.sku,
          r.tituloDepois || r.tituloAntes,
          r.marca,
          r.status,
          r.tituloAlterado ? "Sim" : "Não",
          r.tagsAlteradas ? "Sim" : "Não",
          r.colecoesAlteradas ? "Sim" : "Não",
          r.descricaoGerada ? "Sim" : "Não",
        ]
          .map(csvEscape)
          .join(";"),
      ),
    ];
    const blob = new Blob(["\ufeff" + lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-pitter-pan-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const topBrand = byBrand[0];
  const topProduct = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => {
      const k = (r.tituloDepois || r.tituloAntes || r.sku).trim();
      if (k) m.set(k, (m.get(k) || 0) + 1);
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0];
  }, [rows]);
  if (loading) return <div className="panel">Carregando relatórios...</div>;
  if (error)
    return (
      <div className="panel">
        <b>Erro ao carregar relatórios</b>
        <p>{error}</p>
        <button className="btn" onClick={() => load(true)}>
          <RefreshCw size={16} />
          Tentar novamente
        </button>
      </div>
    );
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Relatórios</h1>
          <div className="page-sub">
            Análises e exportações para acompanhamento da operação.
          </div>
        </div>
        <button className="btn" onClick={() => load(true)}>
          <RefreshCw size={16} />
          Atualizar
        </button>
      </div>
      <div className="reports-filterbar">
        <label>
          Período
          <div className="period-fields">
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
            <span>—</span>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
        </label>
        <label>
          Marca
          <select value={brand} onChange={(e) => setBrand(e.target.value)}>
            <option value="">Todas as marcas</option>
            {brands.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos os status</option>
            <option value="sucesso">Sucesso</option>
            <option value="erro">Erro</option>
          </select>
        </label>
        <button className="btn btn-primary" onClick={apply}>
          <BarChart3 size={16} />
          Gerar relatório
        </button>
        <button className="btn" onClick={exportCsv}>
          <Download size={16} />
          Exportar CSV
        </button>
      </div>
      <div className="report-metrics">
        <div className="report-stat">
          <Box />
          <span>
            Produtos processados
            <strong>{current.total.toLocaleString("pt-BR")}</strong>
            <em>
              {pct(current.total, previous.total) == null
                ? "Sem base"
                : `${(pct(current.total, previous.total) ?? 0) >= 0 ? "↑" : "↓"} ${Math.abs(pct(current.total, previous.total)!).toFixed(1)}%`}
            </em>
          </span>
        </div>
        <div className="report-stat green">
          <CheckCircle2 />
          <span>
            Sucesso<strong>{current.sucesso.toLocaleString("pt-BR")}</strong>
            <em>
              {pct(current.sucesso, previous.sucesso) == null
                ? "Sem base"
                : `${(pct(current.sucesso, previous.sucesso) ?? 0) >= 0 ? "↑" : "↓"} ${Math.abs(pct(current.sucesso, previous.sucesso)!).toFixed(1)}%`}
            </em>
          </span>
        </div>
        <div className="report-stat red">
          <XCircle />
          <span>
            Erros<strong>{current.erros.toLocaleString("pt-BR")}</strong>
            <em>
              {pct(current.erros, previous.erros) == null
                ? "Sem base"
                : `${(pct(current.erros, previous.erros) ?? 0) >= 0 ? "↑" : "↓"} ${Math.abs(pct(current.erros, previous.erros)!).toFixed(1)}%`}
            </em>
          </span>
        </div>
        <div className="report-stat gold">
          <Clock3 />
          <span>
            Tempo economizado<strong>{fmt(current.tempo)}</strong>
            <em>
              {pct(current.tempo, previous.tempo) == null
                ? "Sem base"
                : `${(pct(current.tempo, previous.tempo) ?? 0) >= 0 ? "↑" : "↓"} ${Math.abs(pct(current.tempo, previous.tempo)!).toFixed(1)}%`}
            </em>
          </span>
        </div>
        <div className="report-stat violet">
          <BarChart3 />
          <span>
            Taxa de sucesso<strong>{current.taxa.toFixed(1)}%</strong>
            <em>
              {previous.taxa
                ? `${current.taxa - previous.taxa >= 0 ? "↑" : "↓"} ${Math.abs(current.taxa - previous.taxa).toFixed(1)} p.p.`
                : "Sem base"}
            </em>
          </span>
        </div>
      </div>
      <div className="reports-grid">
        <div className="panel report-chart wide">
          <div className="panel-title">Evolução de processamentos</div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={byDay}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="data" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="total" fill="#6ea8ff" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="panel report-chart">
          <div className="panel-title">Sucesso vs. Erro</div>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={[
                  { name: "Sucesso", value: current.sucesso },
                  { name: "Erro", value: current.erros },
                ]}
                dataKey="value"
                innerRadius={58}
                outerRadius={82}
              >
                {[0, 1].map((_, i) => (
                  <Cell key={i} fill={i === 0 ? "#35b66f" : "#ef5350"} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="panel ranking">
          <div className="panel-title">Ranking de marcas</div>
          {byBrand.slice(0, 5).map((b, i) => (
            <div className="rank-row" key={b.marca}>
              <span>{i + 1}</span>
              <div>
                <b>{b.marca}</b>
                <i
                  style={{
                    width: `${Math.max(8, (b.total / (byBrand[0]?.total || 1)) * 100)}%`,
                  }}
                />
              </div>
              <strong>{b.total}</strong>
            </div>
          ))}
        </div>
      </div>
      <div className="reports-bottom">
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Relatórios gerados</div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data e hora</th>
                  <th>Período</th>
                  <th>Filtros</th>
                  <th>Formato</th>
                  <th>Status</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {generated.length ? (
                  generated.map((g) => (
                    <tr key={g.id}>
                      <td>{g.createdAt}</td>
                      <td>{g.periodo}</td>
                      <td>{g.filtros}</td>
                      <td>{g.formato}</td>
                      <td>
                        <span className="badge badge-success">{g.status}</span>
                      </td>
                      <td>
                        <button className="table-action" onClick={exportCsv}>
                          <Download size={14} />
                          Baixar
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center" }}>
                      Gere um relatório para começar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="panel insights">
          <div className="panel-title">Insights do período</div>
          <div className="insight">
            <TrendingUp />
            <span>
              <b>Crescimento no volume</b>
              <small>
                {pct(current.total, previous.total) == null
                  ? "Ainda não há período anterior comparável."
                  : `O volume foi ${Math.abs(pct(current.total, previous.total)!).toFixed(1)}% ${(pct(current.total, previous.total) ?? 0) >= 0 ? "maior" : "menor"} que no período anterior.`}
              </small>
            </span>
          </div>
          <div className="insight">
            <BarChart3 />
            <span>
              <b>Taxa de sucesso</b>
              <small>
                A operação ficou em {current.taxa.toFixed(1)}% de sucesso no
                período.
              </small>
            </span>
          </div>
          <div className="insight">
            <Clock3 />
            <span>
              <b>Tempo otimizado</b>
              <small>
                Estimativa de {fmt(current.tempo)} de trabalho manual
                economizado.
              </small>
            </span>
          </div>
          <div className="insight">
            <FileText />
            <span>
              <b>Marca destaque</b>
              <small>
                {topBrand
                  ? `${topBrand.marca} liderou com ${topBrand.total} processamentos.`
                  : "Sem dados de marca no período."}
              </small>
            </span>
          </div>
          <div className="insight">
            <Box />
            <span>
              <b>Produto mais processado</b>
              <small>
                {topProduct
                  ? `${topProduct[0]} apareceu ${topProduct[1]} vez(es) no período.`
                  : "Sem produtos no período."}
              </small>
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
