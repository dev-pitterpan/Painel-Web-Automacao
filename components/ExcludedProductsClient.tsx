"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArchiveX,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  Sheet,
} from "lucide-react";
import type { ExcludedProductRow } from "@/lib/types";
import { ProductThumbnail } from "@/components/ProductThumbnail";
import { multipleSkuTerms } from "@/lib/search";

const PAGE_SIZE = 100;
type ApiResponse = {
  rows: ExcludedProductRow[];
  source: { lastSyncedAt: string; sheetName: string; totalRows: number };
  error?: string;
};

function normalized(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function statusKind(status: string) {
  const value = normalized(status);
  if (value === "excluido") return "deleted";
  if (value.includes("nao encontrado")) return "not-found";
  return "other";
}

export function ExcludedProductsClient() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(14);
  const [loadingExiting, setLoadingExiting] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [date, setDate] = useState("");
  const [page, setPage] = useState(1);

  async function load(force = false) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/excluded${force ? "?refresh=1" : ""}`,
        { cache: "no-store" },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error || "Não foi possível carregar os produtos excluídos.",
        );
      setData(body);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível carregar os produtos excluídos.",
      );
    } finally {
      setLoading(false);
      setLoadingProgress(100);
      setLoadingExiting(true);
    }
  }

  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    setPage(1);
  }, [query, status, date]);
  useEffect(() => {
    if (!loading) {
      setLoadingProgress(100);
      return;
    }
    setLoadingProgress(14);
    const interval = window.setInterval(
      () => setLoadingProgress((current) => Math.min(current + 5, 92)),
      180,
    );
    return () => window.clearInterval(interval);
  }, [loading]);
  useEffect(() => {
    if (loading || !loadingExiting) return;
    const timeout = window.setTimeout(() => setLoadingExiting(false), 360);
    return () => window.clearTimeout(timeout);
  }, [loading, loadingExiting]);

  const filteredRows = useMemo(() => {
    const term = normalized(query);
    const skuTerms = multipleSkuTerms(query);
    return (data?.rows || []).filter((row) => {
      const matchesQuery =
        !term ||
        (skuTerms.length
          ? [
              row.productCode,
              row.manufacturerCode,
              row.barcode,
              row.shopifyId,
            ].some((value) => skuTerms.includes(normalized(value)))
          : [
              row.productCode,
              row.manufacturerCode,
              row.barcode,
              row.description,
              row.shopifyId,
              row.shopifyError,
            ].some((value) => normalized(value).includes(term)));
      const matchesStatus =
        status === "all" || statusKind(row.shopifyStatus) === status;
      const matchesDate =
        !date || row.exclusionDate === date.split("-").reverse().join("/");
      return matchesQuery && matchesStatus && matchesDate;
    });
  }, [data, query, status, date]);

  const metrics = useMemo(
    () => ({
      total: data?.rows.length || 0,
      deleted: (data?.rows || []).filter(
        (row) => statusKind(row.shopifyStatus) === "deleted",
      ).length,
      notFound: (data?.rows || []).filter(
        (row) => statusKind(row.shopifyStatus) === "not-found",
      ).length,
      errors: (data?.rows || []).filter((row) => Boolean(row.shopifyError))
        .length,
    }),
    [data],
  );
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const visibleRows = filteredRows.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

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

  return (
    <>
      <div className="page-head excluded-page-head">
        <div>
          <h1 className="page-title">Excluídos</h1>
          <div className="page-sub">
            Produtos fora de linha e com estoque zerado.
          </div>
        </div>
        {data && (
          <div className="excluded-source">
            <Sheet size={15} />
            <span>
              <strong>Google Sheets</strong>
              <small>
                Atualizado em{" "}
                {new Date(data.source.lastSyncedAt).toLocaleString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                })}
              </small>
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="users-message is-error" role="alert">
          <AlertCircle size={16} />
          {error}
        </div>
      )}
      <section className="excluded-metrics">
        <div className="panel excluded-metric">
          <span className="tone-blue">
            <ArchiveX />
          </span>
          <div>
            <small>Total na planilha</small>
            <strong>{metrics.total.toLocaleString("pt-BR")}</strong>
          </div>
        </div>
        <div className="panel excluded-metric">
          <span className="tone-green">
            <CheckCircle2 />
          </span>
          <div>
            <small>Excluídos</small>
            <strong>{metrics.deleted.toLocaleString("pt-BR")}</strong>
          </div>
        </div>
        <div className="panel excluded-metric">
          <span className="tone-gold">
            <Search />
          </span>
          <div>
            <small>Não encontrados</small>
            <strong>{metrics.notFound.toLocaleString("pt-BR")}</strong>
          </div>
        </div>
        <div className="panel excluded-metric">
          <span className="tone-red">
            <AlertCircle />
          </span>
          <div>
            <small>Com observação</small>
            <strong>{metrics.errors.toLocaleString("pt-BR")}</strong>
          </div>
        </div>
      </section>

      <section className="panel excluded-panel">
        <div className="excluded-filters">
          <label className="excluded-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar produto ou colar vários códigos..."
            />
          </label>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label="Filtrar por status"
          >
            <option value="all">Todos os status</option>
            <option value="deleted">Excluídos</option>
            <option value="not-found">Não encontrados</option>
            <option value="other">Outros</option>
          </select>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            aria-label="Filtrar por data de exclusão"
          />
          <button
            className="btn excluded-refresh"
            type="button"
            onClick={() => load(true)}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? "spin" : ""} />
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>

        {loading && !data ? (
          <div className="empty">Carregando produtos excluídos...</div>
        ) : filteredRows.length === 0 ? (
          <div className="empty-results">
            <div className="empty-results-icon">
              <ArchiveX size={24} />
            </div>
            <strong>Nenhum produto encontrado</strong>
            <span>Altere os filtros para visualizar outros registros.</span>
          </div>
        ) : (
          <div className="table-wrap excluded-table">
            <table>
              <thead>
                <tr>
                  <th className="product-image-column">Imagem</th>
                  <th>Cód. produto</th>
                  <th>Cód. fabricante</th>
                  <th>EAN / Cód. barras</th>
                  <th>Descrição</th>
                  <th>Unidade</th>
                  <th>Data exclusão</th>
                  <th>Status Shopify</th>
                  <th>ID Shopify</th>
                  <th>Erro Shopify</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, index) => (
                  <tr key={`${row.productCode}-${row.barcode}-${index}`}>
                    <td className="product-image-cell" data-label="Imagem">
                      <ProductThumbnail
                        sku={row.productCode}
                        title={row.description}
                      />
                    </td>
                    <td data-label="Cód. produto">
                      <strong>{row.productCode || "—"}</strong>
                    </td>
                    <td data-label="Cód. fabricante">
                      {row.manufacturerCode || "—"}
                    </td>
                    <td data-label="EAN / Cód. barras">{row.barcode || "—"}</td>
                    <td data-label="Descrição">
                      <strong>{row.description || "—"}</strong>
                    </td>
                    <td data-label="Unidade">{row.unit || "—"}</td>
                    <td data-label="Data exclusão">
                      {row.exclusionDate || "—"}
                    </td>
                    <td data-label="Status Shopify">
                      <span
                        className={`excluded-status is-${statusKind(row.shopifyStatus)}`}
                      >
                        {row.shopifyStatus || "Pendente"}
                      </span>
                    </td>
                    <td data-label="ID Shopify">
                      <span className="excluded-shopify-id">
                        {row.shopifyId || "—"}
                      </span>
                    </td>
                    <td data-label="Erro Shopify">
                      <span
                        className={row.shopifyError ? "excluded-error" : ""}
                      >
                        {row.shopifyError || "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filteredRows.length > 0 && (
          <div className="products-pagination">
            <span>
              Exibindo {((page - 1) * PAGE_SIZE + 1).toLocaleString("pt-BR")}–
              {Math.min(page * PAGE_SIZE, filteredRows.length).toLocaleString(
                "pt-BR",
              )}{" "}
              de {filteredRows.length.toLocaleString("pt-BR")}
            </span>
            <div className="pagination">
              <button
                type="button"
                aria-label="Página anterior"
                disabled={page === 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                <ChevronLeft size={16} />
              </button>
              <strong>
                {page} / {totalPages}
              </strong>
              <button
                type="button"
                aria-label="Próxima página"
                disabled={page >= totalPages}
                onClick={() =>
                  setPage((value) => Math.min(totalPages, value + 1))
                }
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
