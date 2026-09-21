"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3,
  Download, Eye, FileBarChart, FileText, Layers3, PackageCheck, RefreshCw,
  RotateCcw, Tag, TriangleAlert,
} from "lucide-react";
import type { DashboardData, HistoryRow } from "@/lib/types";
import { calculateTimeSavedMinutes, parseHistoryDate } from "@/lib/metrics";
import { ProductDetailsDrawer } from "@/components/ProductDetailsDrawer";

type ReportKind = "executivo" | "marca" | "erros" | "alteracoes" | "produtividade";
type AppliedFilters = { start: string; end: string; brand: string; status: string; change: string };
type ExportItem = { id: string; createdAt: string; report: string; period: string; rows: number; status: string };
type BrandReportRow = { brand: string; products: number; total: number; successes: number; errors: number };
type ProductivityReportRow = { date: string; sort: number; total: number; changed: number; successes: number; errors: number; minutes: number };

const PAGE_SIZE = 6;
const PROGRESSIVE_BATCH_SIZE = 100;
const REPORT_LABELS: Record<ReportKind, string> = {
  executivo: "Resumo executivo", marca: "Relatório por marca", erros: "Relatório de erros",
  alteracoes: "Relatório de alterações", produtividade: "Relatório de produtividade",
};
const isBrand = (value: string) => /\p{L}/u.test(String(value || "").trim());
const isError = (row: HistoryRow) => String(row.status || "").toLowerCase().startsWith("erro");
const hasChange = (row: HistoryRow) => row.tituloAlterado || row.tagsAlteradas || row.colecoesAlteradas || row.descricaoGerada;
const fmtMinutes = (minutes: number) => { const totalMinutes = Math.floor(minutes); return `${Math.floor(totalMinutes / 60)}h ${String(totalMinutes % 60).padStart(2, "0")}min`; };
const csvEscape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const formatDateInput = (value: string) => value.split("-").reverse().join("/");
const toInputDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const defaultDateRange = () => { const endDate = new Date(); const startDate = new Date(); startDate.setDate(startDate.getDate() - 29); return { start: toInputDate(startDate), end: toInputDate(endDate) }; };
const monthLabel = (date: Date) => { const value = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date); return value.charAt(0).toUpperCase() + value.slice(1); };
function calendarDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const total = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return [...Array(offset).fill(null), ...Array.from({ length: total }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1))];
}
const readStorage = <T,>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; }
};

function rowChanges(row: HistoryRow) {
  const changes: string[] = [];
  if (row.tituloAlterado) changes.push("Título");
  if (row.tagsAlteradas) changes.push("Tags");
  if (row.colecoesAlteradas) changes.push("Coleções");
  if (row.descricaoGerada) changes.push("Descrição");
  return changes;
}

export function ReportsClient() {
  const [defaultFilters] = useState(defaultDateRange);
  const [allRows, setAllRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(14);
  const [loadingExiting, setLoadingExiting] = useState(false);
  const [error, setError] = useState("");
  const [start, setStart] = useState(defaultFilters.start);
  const [end, setEnd] = useState(defaultFilters.end);
  const [brand, setBrand] = useState("");
  const [status, setStatus] = useState("");
  const [change, setChange] = useState("");
  const [applied, setApplied] = useState<AppliedFilters | null>(null);
  const [reportKind, setReportKind] = useState<ReportKind>("executivo");
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [visibleCompleteCount, setVisibleCompleteCount] = useState(PROGRESSIVE_BATCH_SIZE);
  const [selectedProduct, setSelectedProduct] = useState<HistoryRow | null>(null);
  const [exports, setExports] = useState<ExportItem[]>([]);
  const [generations, setGenerations] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectingEnd, setSelectingEnd] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => { const date = new Date(`${defaultFilters.start}T12:00:00`); return new Date(date.getFullYear(), date.getMonth(), 1); });
  const previewRef = useRef<HTMLDivElement>(null);
  const completeTableRef = useRef<HTMLDivElement>(null);
  const datePickerRef = useRef<HTMLDivElement>(null);

  async function load(refresh = false) {
    setLoading(true); setLoadingExiting(false); setError("");
    try {
      const response = await fetch(`/api/dashboard?days=3650${refresh ? "&refresh=1" : ""}`, { cache: "no-store" });
      const data = await response.json() as DashboardData & { error?: string };
      if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
      setAllRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao carregar relatórios."); }
    finally { setLoadingProgress(100); setLoading(false); setLoadingExiting(true); }
  }

  useEffect(() => {
    load();
    setExports(readStorage<ExportItem[]>("pitter-report-exports", []));
    setGenerations(readStorage<string[]>("pitter-report-generations", []));
  }, []);
  useEffect(() => { if (!applied && allRows.length) setApplied({ start, end, brand, status, change }); }, [allRows, applied, start, end, brand, status, change]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 2800); return () => window.clearTimeout(timer); }, [toast]);
  useEffect(() => {
    if (!calendarOpen) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (!datePickerRef.current?.contains(event.target as Node)) { setCalendarOpen(false); setSelectingEnd(false); }
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [calendarOpen]);
  useEffect(() => {
    if (!loading) { setLoadingProgress(100); return; }
    setLoadingProgress(14);
    const interval = window.setInterval(() => setLoadingProgress(value => Math.min(value + 5, 92)), 180);
    return () => window.clearInterval(interval);
  }, [loading]);
  useEffect(() => {
    if (loading || !loadingExiting) return;
    const timeout = window.setTimeout(() => setLoadingExiting(false), 360);
    return () => window.clearTimeout(timeout);
  }, [loading, loadingExiting]);

  const brands = useMemo(() => [...new Set(allRows.map(row => String(row.marca || "").trim()).filter(isBrand))].sort((a, b) => a.localeCompare(b, "pt-BR")), [allRows]);
  const filteredRows = useMemo(() => {
    const filters = applied || { start, end, brand, status, change };
    const startAt = new Date(`${filters.start}T00:00:00-03:00`).getTime();
    const endAt = new Date(`${filters.end}T23:59:59-03:00`).getTime();
    return allRows.filter(row => {
      const date = parseHistoryDate(row.dataHora);
      if (!date || date.getTime() < startAt || date.getTime() > endAt) return false;
      if (filters.brand && row.marca !== filters.brand) return false;
      if (filters.status === "sucesso" && isError(row)) return false;
      if (filters.status === "erro" && !isError(row)) return false;
      if (filters.change === "titulo" && !row.tituloAlterado) return false;
      if (filters.change === "tags" && !row.tagsAlteradas) return false;
      if (filters.change === "colecoes" && !row.colecoesAlteradas) return false;
      if (filters.change === "descricao" && !row.descricaoGerada) return false;
      return true;
    });
  }, [allRows, applied, start, end, brand, status, change]);

  const reportRows = useMemo(() => reportKind === "erros" ? filteredRows.filter(isError) : reportKind === "alteracoes" ? filteredRows.filter(hasChange) : filteredRows, [filteredRows, reportKind]);
  const brandRows = useMemo<BrandReportRow[]>(() => {
    const grouped = new Map<string, { skus: Set<string>; total: number; successes: number; errors: number }>();
    filteredRows.forEach(row => {
      const key = String(row.marca || "Sem marca").trim() || "Sem marca";
      const item = grouped.get(key) || { skus: new Set<string>(), total: 0, successes: 0, errors: 0 };
      item.skus.add(row.sku || row.tituloDepois || row.tituloAntes || `${key}-${item.total}`);
      item.total += 1;
      if (isError(row)) item.errors += 1; else item.successes += 1;
      grouped.set(key, item);
    });
    return [...grouped.entries()].map(([itemBrand, item]) => ({ brand: itemBrand, products: item.skus.size, total: item.total, successes: item.successes, errors: item.errors })).sort((a, b) => b.total - a.total || a.brand.localeCompare(b.brand, "pt-BR"));
  }, [filteredRows]);
  const productivityRows = useMemo<ProductivityReportRow[]>(() => {
    const grouped = new Map<string, ProductivityReportRow>();
    filteredRows.forEach(row => {
      const parsed = parseHistoryDate(row.dataHora);
      if (!parsed) return;
      const key = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
      const item = grouped.get(key) || { date: new Intl.DateTimeFormat("pt-BR").format(parsed), sort: new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime(), total: 0, changed: 0, successes: 0, errors: 0, minutes: 0 };
      item.total += 1;
      if (hasChange(row)) item.changed += 1;
      if (isError(row)) item.errors += 1; else item.successes += 1;
      grouped.set(key, item);
    });
    return [...grouped.values()].sort((a, b) => b.sort - a.sort).map(item => ({ ...item, minutes: calculateTimeSavedMinutes(item.total) }));
  }, [filteredRows]);
  const summaries = useMemo(() => ({
    generated: generations.filter(createdAt => {
      const parts = createdAt.split(",")[0].split("/");
      const date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T12:00:00`);
      const from = new Date(`${(applied || { start }).start}T00:00:00`);
      const to = new Date(`${(applied || { end }).end}T23:59:59`);
      return !Number.isNaN(date.getTime()) && date >= from && date <= to;
    }).length,
    changed: new Set(filteredRows.filter(hasChange).map(row => row.sku || row.tituloDepois || row.tituloAntes)).size,
    errors: filteredRows.filter(isError).length,
    time: calculateTimeSavedMinutes(filteredRows.length),
  }), [filteredRows, generations, applied, start, end]);

  const previewCount = reportKind === "marca" ? brandRows.length : reportKind === "produtividade" ? productivityRows.length : reportRows.length;
  useEffect(() => {
    if (!showAll) return;
    const container = completeTableRef.current;
    if (!container) return;
    const loadNextBatch = () => {
      if (container.scrollTop + container.clientHeight >= container.scrollHeight - 140) {
        setVisibleCompleteCount(current => Math.min(current + PROGRESSIVE_BATCH_SIZE, previewCount));
      }
    };
    container.addEventListener("scroll", loadNextBatch, { passive: true });
    return () => container.removeEventListener("scroll", loadNextBatch);
  }, [showAll, previewCount]);
  const totalPages = Math.max(1, Math.ceil(previewCount / PAGE_SIZE));
  const sliceStart = (page - 1) * PAGE_SIZE;
  const sliceEnd = page * PAGE_SIZE;
  const visibleRows = showAll ? reportRows.slice(0, visibleCompleteCount) : reportRows.slice(sliceStart, sliceEnd);
  const visibleBrands = showAll ? brandRows.slice(0, visibleCompleteCount) : brandRows.slice(sliceStart, sliceEnd);
  const visibleProductivity = showAll ? productivityRows.slice(0, visibleCompleteCount) : productivityRows.slice(sliceStart, sliceEnd);
  const rangeStart = previewCount ? (showAll ? 1 : sliceStart + 1) : 0;
  const rangeEnd = showAll ? Math.min(visibleCompleteCount, previewCount) : Math.min(sliceEnd, previewCount);
  const hasActiveFilters = start !== defaultFilters.start || end !== defaultFilters.end || Boolean(brand || status || change);

  function chooseDate(date: Date) {
    const value = toInputDate(date);
    if (!selectingEnd) {
      setStart(value); setEnd(value); setSelectingEnd(true);
      setApplied(current => ({ ...(current || { brand, status, change }), start: value, end: value }));
      setPage(1); setShowAll(false); return;
    }
    const nextStart = value < start ? value : start;
    const nextEnd = value < start ? start : value;
    setStart(nextStart); setEnd(nextEnd); setSelectingEnd(false);
    setApplied(current => ({ ...(current || { brand, status, change }), start: nextStart, end: nextEnd }));
    setPage(1); setShowAll(false);
  }

  function resetFilters() {
    setStart(defaultFilters.start); setEnd(defaultFilters.end); setBrand(""); setStatus(""); setChange("");
    setApplied({ ...defaultFilters, brand: "", status: "", change: "" }); setPage(1); setShowAll(false); setSelectingEnd(false); setCalendarOpen(false);
  }

  function applyFilters() {
    if (start > end) { setToast("A data inicial deve ser anterior à data final."); return; }
    setApplied({ start, end, brand, status, change }); setPage(1); setShowAll(false);
    const nextGenerations = [new Date().toLocaleString("pt-BR"), ...generations].slice(0, 100);
    setGenerations(nextGenerations); localStorage.setItem("pitter-report-generations", JSON.stringify(nextGenerations));
    setToast("Relatório atualizado com os filtros selecionados.");
  }
  function selectReport(kind: ReportKind) {
    setReportKind(kind); setPage(1); setShowAll(false);
    window.setTimeout(() => previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }
  function exportCsv(kind: ReportKind = reportKind) {
    const selected = kind === "marca" ? brandRows : kind === "produtividade" ? productivityRows : kind === "erros" ? filteredRows.filter(isError) : kind === "alteracoes" ? filteredRows.filter(hasChange) : filteredRows;
    let lines: string[];
    if (kind === "marca") {
      lines = [["Marca", "Produtos únicos", "Processamentos", "Sucessos", "Erros"].join(";"), ...brandRows.map(row => [row.brand, row.products, row.total, row.successes, row.errors].map(csvEscape).join(";"))];
    } else if (kind === "produtividade") {
      lines = [["Data", "Processamentos", "Produtos alterados", "Sucessos", "Erros", "Tempo economizado"].join(";"), ...productivityRows.map(row => [row.date, row.total, row.changed, row.successes, row.errors, fmtMinutes(row.minutes)].map(csvEscape).join(";"))];
    } else {
      const historyRows = selected as HistoryRow[];
      lines = [["Data/Hora", "SKU", "Produto", "Marca", "Status", "Alterações"].join(";"), ...historyRows.map(row => [row.dataHora, row.sku, row.tituloDepois || row.tituloAntes, row.marca, row.status, rowChanges(row).join(", ") || "Sem alteração"].map(csvEscape).join(";"))];
    }
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url;
    anchor.download = `${REPORT_LABELS[kind].toLowerCase().replaceAll(" ", "-")}-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click(); URL.revokeObjectURL(url);
    const filters = applied || { start, end };
    const item: ExportItem = { id: crypto.randomUUID(), createdAt: new Date().toLocaleString("pt-BR"), report: REPORT_LABELS[kind], period: `${formatDateInput(filters.start)} a ${formatDateInput(filters.end)}`, rows: selected.length, status: "Concluído" };
    const next = [item, ...exports].slice(0, 12); setExports(next); localStorage.setItem("pitter-report-exports", JSON.stringify(next));
    fetch("/api/audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "report_exported", details: { report: REPORT_LABELS[kind], rows: selected.length, period: item.period } }) }).catch(() => undefined);
    setToast("Arquivo CSV exportado com sucesso.");
  }
  if (loading || loadingExiting) return <div className={`loading-screen ${loadingExiting ? "is-exiting" : ""}`} role="status" aria-live="polite"><div className="loading-card"><img className="loading-logo" src="/favicon.svg" alt="Pitter Pan Festas" /><h1>Carregando dados da planilha...</h1><div className="loading-progress-row"><div className="loading-progress" aria-hidden="true"><span className="loading-progress-fill" style={{ width: `${loadingProgress}%` }} /></div><strong>{loadingProgress}%</strong></div></div></div>;
  if (error) return <div className="panel reports-state"><b>Erro ao carregar relatórios</b><p>{error}</p><button className="btn" onClick={() => load(true)}><RefreshCw size={16} />Tentar novamente</button></div>;

  const filters = applied || { start, end, brand, status, change };
  const reportCards: Array<{ kind: ReportKind; icon: typeof FileText; text: string; tone: string }> = [
    { kind: "executivo", icon: FileBarChart, text: "Visão geral dos resultados e principais indicadores do período.", tone: "blue" },
    { kind: "marca", icon: Tag, text: "Desempenho detalhado dos produtos agrupados por marca.", tone: "violet" },
    { kind: "erros", icon: TriangleAlert, text: "Ocorrências com erro para conferência e reprocessamento.", tone: "red" },
    { kind: "alteracoes", icon: Layers3, text: "Histórico de títulos, tags, coleções e descrições alteradas.", tone: "gold" },
    { kind: "produtividade", icon: BarChart3, text: "Volume processado e estimativa de tempo economizado.", tone: "green" },
  ];

  return <>
    <ProductDetailsDrawer row={selectedProduct} onClose={() => setSelectedProduct(null)} />
    {toast && <div className="reports-toast"><Check size={16} />{toast}</div>}
    <div className="page-head reports-page-head"><div><h1 className="page-title">Relatórios</h1><div className="page-sub">Gere, visualize e acompanhe relatórios da operação de produtos.</div></div><div className="reports-head-actions"><button className="btn" onClick={() => exportCsv()}><Download size={16} />Exportar CSV</button></div></div>

    <section className="reports-filterbar" aria-label="Filtros do relatório">
      <label className="report-period-label">Período<div className="report-date-picker" ref={datePickerRef}><button type="button" className="report-date-trigger" onClick={() => { setCalendarOpen(value => !value); setSelectingEnd(false); }} aria-expanded={calendarOpen}><CalendarDays size={16} /><span>{formatDateInput(start)} — {formatDateInput(end)}</span><ChevronDown size={15} /></button>{calendarOpen && <div className="report-calendar-popover">
        <div className="calendar-instruction">{selectingEnd ? "Agora selecione a data final" : "Selecione a data inicial"}</div>
        <div className="dual-calendar">
          {[calendarMonth, new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1)].map((shownMonth, monthIndex) => <div className="calendar-month" key={shownMonth.toISOString()}><div className="calendar-title">{monthIndex === 0 && <button type="button" onClick={() => setCalendarMonth(value => new Date(value.getFullYear(), value.getMonth() - 1, 1))} aria-label="Meses anteriores"><ChevronLeft /></button>}<strong>{monthLabel(shownMonth)}</strong>{monthIndex === 1 && <button type="button" onClick={() => setCalendarMonth(value => new Date(value.getFullYear(), value.getMonth() + 1, 1))} aria-label="Próximos meses"><ChevronRight /></button>}</div><div className="calendar-weekdays">{["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map(day => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{calendarDays(shownMonth).map((date, index) => date ? <button type="button" key={date.toISOString()} onClick={() => chooseDate(date)} className={`${toInputDate(date) >= start && toInputDate(date) <= end ? "is-in-range" : ""} ${toInputDate(date) === start ? "is-range-start" : ""} ${toInputDate(date) === end ? "is-range-end" : ""}`}>{date.getDate()}</button> : <span key={`empty-${index}`} />)}</div></div>)}
        </div>
      </div>}</div></label>
      <label>Marca<select value={brand} onChange={event => setBrand(event.target.value)}><option value="">Todas as marcas</option>{brands.map(item => <option key={item}>{item}</option>)}</select></label>
      <label>Status<select value={status} onChange={event => setStatus(event.target.value)}><option value="">Todos os status</option><option value="sucesso">Sucesso</option><option value="erro">Erro</option></select></label>
      <label>Tipo de alteração<select value={change} onChange={event => setChange(event.target.value)}><option value="">Todos os tipos</option><option value="titulo">Título</option><option value="tags">Tags</option><option value="colecoes">Coleções</option><option value="descricao">Descrição</option></select></label>
      <div className="reports-filter-actions"><button className="btn btn-primary reports-generate" onClick={applyFilters}><BarChart3 size={16} />Gerar relatório</button>{hasActiveFilters && <button className="btn reports-reset" onClick={resetFilters}><RotateCcw size={15} />Resetar</button>}</div>
    </section>

    <section className="report-metrics" aria-label="Resumo do período">
      <article className="report-stat"><span className="report-stat-icon blue"><FileText /></span><div><span>Relatórios gerados no período</span><strong>{summaries.generated}</strong><small>Relatórios atualizados</small></div></article>
      <article className="report-stat"><span className="report-stat-icon green"><PackageCheck /></span><div><span>Produtos com alteração</span><strong>{summaries.changed.toLocaleString("pt-BR")}</strong><small>Produtos únicos</small></div></article>
      <article className="report-stat"><span className="report-stat-icon red"><TriangleAlert /></span><div><span>Erros exportados</span><strong>{summaries.errors.toLocaleString("pt-BR")}</strong><small>No período selecionado</small></div></article>
      <article className="report-stat"><span className="report-stat-icon gold"><Clock3 /></span><div><span>Tempo economizado no período</span><strong>{fmtMinutes(summaries.time)}</strong><small>1 min manual por produto − lotes de 5 em 40s</small></div></article>
    </section>

    <section className="panel reports-available"><div className="reports-section-head"><div><h2>Relatórios disponíveis</h2><p>Escolha um modelo para visualizar ou exportar.</p></div></div><div className="report-card-grid">{reportCards.map(card => { const Icon = card.icon; return <article className="available-report" key={card.kind}><span className={`available-icon ${card.tone}`}><Icon /></span><div className="available-copy"><h3>{REPORT_LABELS[card.kind]}</h3><p>{card.text}</p></div><div className="available-actions"><button onClick={() => selectReport(card.kind)}><Eye size={15} />Visualizar</button><button onClick={() => exportCsv(card.kind)} aria-label={`Exportar ${REPORT_LABELS[card.kind]}`}><Download size={15} />Exportar</button></div></article>; })}</div></section>

    <div className="reports-content-grid">
      <section className="panel reports-preview" ref={previewRef}><div className="reports-section-head preview-head"><div><h2>Prévia do relatório</h2><p>{REPORT_LABELS[reportKind]} · {formatDateInput(filters.start)} a {formatDateInput(filters.end)}</p></div><span className="preview-count">{previewCount.toLocaleString("pt-BR")} registros</span></div><div ref={completeTableRef} className={`table-wrap reports-preview-table ${showAll ? "is-complete" : ""}`}>
        {reportKind === "marca" ? <table><thead><tr><th>Marca</th><th>Produtos únicos</th><th>Processamentos</th><th>Sucessos</th><th>Erros</th></tr></thead><tbody>{visibleBrands.length ? visibleBrands.map(row => <tr key={row.brand}><td><b>{row.brand}</b></td><td>{row.products.toLocaleString("pt-BR")}</td><td>{row.total.toLocaleString("pt-BR")}</td><td><span className="badge badge-success">{row.successes.toLocaleString("pt-BR")}</span></td><td><span className={row.errors ? "badge badge-error" : "badge badge-success"}>{row.errors.toLocaleString("pt-BR")}</span></td></tr>) : <tr><td colSpan={5} className="empty">Nenhum registro encontrado nesse período.</td></tr>}</tbody></table>
        : reportKind === "produtividade" ? <table><thead><tr><th>Data</th><th>Processamentos</th><th>Com alteração</th><th>Sucessos</th><th>Erros</th><th>Tempo economizado</th></tr></thead><tbody>{visibleProductivity.length ? visibleProductivity.map(row => <tr key={row.sort}><td><b>{row.date}</b></td><td>{row.total.toLocaleString("pt-BR")}</td><td>{row.changed.toLocaleString("pt-BR")}</td><td><span className="badge badge-success">{row.successes.toLocaleString("pt-BR")}</span></td><td><span className={row.errors ? "badge badge-error" : "badge badge-success"}>{row.errors.toLocaleString("pt-BR")}</span></td><td>{fmtMinutes(row.minutes)}</td></tr>) : <tr><td colSpan={6} className="empty">Nenhum registro encontrado nesse período.</td></tr>}</tbody></table>
        : <table><thead><tr><th>Data e hora</th><th>Produto</th><th>Marca</th><th>Tipo de alteração</th><th>Status</th></tr></thead><tbody>{visibleRows.length ? visibleRows.map((row, index) => <tr key={`${row.sku}-${row.dataHora}-${index}`}><td>{row.dataHora}</td><td><button className="product-link" type="button" onClick={() => setSelectedProduct(row)}>{row.tituloDepois || row.tituloAntes || "Produto sem título"}</button><small>SKU {row.sku || "—"}</small></td><td>{row.marca || "—"}</td><td><div className="change-tags">{rowChanges(row).length ? rowChanges(row).map(item => <span key={item}>{item}</span>) : <span className="muted-change">Sem alteração</span>}</div></td><td><span className={`badge ${isError(row) ? "badge-error" : "badge-success"}`}>{isError(row) ? "Erro" : "Sucesso"}</span></td></tr>) : <tr><td colSpan={5} className="empty">Nenhum registro encontrado nesse período.</td></tr>}</tbody></table>}
      </div>{showAll && rangeEnd < previewCount && <div className="progressive-hint"><span className="spin-dot" />Role para carregar mais registros · {rangeEnd.toLocaleString("pt-BR")} de {previewCount.toLocaleString("pt-BR")}</div>}<div className="preview-footer"><span>Exibindo {rangeStart}–{rangeEnd} de {previewCount.toLocaleString("pt-BR")}</span><div className="pagination"><button disabled={showAll || page === 1} onClick={() => setPage(value => Math.max(1, value - 1))}><ChevronLeft size={15} /></button><span>{showAll ? "Contínuo" : `${page} / ${totalPages}`}</span><button disabled={showAll || page === totalPages} onClick={() => setPage(value => Math.min(totalPages, value + 1))}><ChevronRight size={15} /></button></div><button className="btn preview-full" onClick={() => { setShowAll(value => !value); setVisibleCompleteCount(PROGRESSIVE_BATCH_SIZE); setPage(1); }}>{showAll ? "Ver prévia paginada" : "Ver relatório completo"}</button></div></section>

    </div>

    <section className="panel exports-history"><div className="reports-section-head"><div><h2>Histórico de exportações</h2><p>Últimos arquivos gerados por este navegador.</p></div><button className="icon-refresh" onClick={() => load(true)} aria-label="Atualizar dados"><RefreshCw size={16} /></button></div><div className="table-wrap"><table><thead><tr><th>Data e hora</th><th>Relatório</th><th>Período</th><th>Registros</th><th>Formato</th><th>Status</th></tr></thead><tbody>{exports.length ? exports.map(item => <tr key={item.id}><td>{item.createdAt}</td><td><b>{item.report}</b></td><td>{item.period}</td><td>{item.rows.toLocaleString("pt-BR")}</td><td><span className="format-pill">CSV</span></td><td><span className="badge badge-success">{item.status}</span></td></tr>) : <tr><td colSpan={6} className="empty">Nenhuma exportação realizada ainda.</td></tr>}</tbody></table></div></section>

  </>;
}
