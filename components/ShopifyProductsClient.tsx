"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle, PackageSearch, RefreshCw, Search } from "lucide-react";
import { ProductDetailsDrawer, type UpdatedProduct } from "@/components/ProductDetailsDrawer";
import type { ShopifyCatalogProduct } from "@/lib/auth";
import type { HistoryRow } from "@/lib/types";

type CatalogResponse = {
  products: ShopifyCatalogProduct[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  permissions?: { canEditProducts: boolean };
  error?: string;
};

function toHistoryRow(product: ShopifyCatalogProduct): HistoryRow {
  return {
    dataHora: product.shopifyUpdatedAt ? new Date(product.shopifyUpdatedAt).toLocaleString("pt-BR") : "-",
    sku: product.sku,
    marca: product.vendor,
    tituloAntes: product.title,
    tituloDepois: product.title,
    tagsAntes: product.tags.join(", "),
    tagsDepois: product.tags.join(", "),
    colecoesAntes: product.collections.join(", "),
    colecoesDepois: product.collections.join(", "),
    tituloAlterado: false,
    tagsAlteradas: false,
    colecoesAlteradas: false,
    descricaoGerada: false,
    status: product.status === "ACTIVE" ? "Sucesso" : product.status,
  };
}

const statusLabel: Record<string, string> = {
  ACTIVE: "Ativo",
  DRAFT: "Rascunho",
  ARCHIVED: "Arquivado",
};

export function ShopifyProductsClient() {
  const [data, setData] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("updated");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), perPage: "50", sort });
      if (query) params.set("q", query);
      if (status) params.set("status", status);
      const response = await fetch(`/api/shopify-products?${params}`, { cache: "no-store" });
      const result = (await response.json()) as CatalogResponse;
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar o catálogo.");
      setData(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro ao carregar o catálogo.");
    } finally {
      setLoading(false);
    }
  }, [page, query, sort, status]);

  useEffect(() => void load(), [load]);
  const selected = useMemo(
    () => data?.products.find((product) => product.shopifyId === selectedId) || null,
    [data, selectedId],
  );

  function updateProduct(updated: UpdatedProduct) {
    setData((current) => current ? {
      ...current,
      products: current.products.map((product) => product.shopifyId === selectedId ? {
        ...product,
        title: updated.title,
        tags: updated.tags,
        collections: updated.collections,
      } : product),
    } : current);
  }

  return (
    <>
      <ProductDetailsDrawer
        row={selected ? toHistoryRow(selected) : null}
        canEdit={Boolean(data?.permissions?.canEditProducts)}
        onClose={() => setSelectedId(null)}
        onProductUpdated={(_, product) => updateProduct(product)}
      />
      <div className="page-head dashboard-title-row">
        <div>
          <h1 className="page-title">Produtos</h1>
          <div className="page-sub">Todos os produtos sincronizados do Shopify.</div>
        </div>
      </div>

      <form className="shopify-catalog-toolbar" onSubmit={(event) => {
        event.preventDefault();
        setPage(1);
        setQuery(search.trim());
      }}>
        <label className="shopify-catalog-search">
          <Search size={17} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por produto, SKU ou marca" />
        </label>
        <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} aria-label="Status do produto">
          <option value="">Todos os status</option>
          <option value="ACTIVE">Ativos</option>
          <option value="DRAFT">Rascunhos</option>
          <option value="ARCHIVED">Arquivados</option>
        </select>
        <select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }} aria-label="Ordenação">
          <option value="updated">Mais recentes</option>
          <option value="title">A–Z</option>
          <option value="inventory">Maior estoque</option>
        </select>
        <button className="btn btn-primary" type="submit">Buscar</button>
        <button className="btn" type="button" onClick={load} aria-label="Atualizar lista"><RefreshCw size={15} /> Atualizar</button>
      </form>

      <section className="panel products-list shopify-catalog-panel">
        <div className="panel-head">
          <div className="panel-title">Catálogo do Shopify</div>
          <div className="metric-note">{(data?.total || 0).toLocaleString("pt-BR")} produtos</div>
        </div>
        {loading ? (
          <div className="shopify-catalog-state"><LoaderCircle className="spin" size={28} /><strong>Carregando produtos</strong></div>
        ) : error ? (
          <div className="shopify-catalog-state is-error"><strong>Não foi possível carregar</strong><span>{error}</span><button className="btn" onClick={load}>Tentar novamente</button></div>
        ) : !data?.products.length ? (
          <div className="shopify-catalog-state"><PackageSearch size={34} /><strong>Nenhum produto sincronizado</strong><span>Execute o fluxo de catálogo no n8n para preencher esta página.</span></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Imagem</th><th>Produto</th><th>SKU</th><th>Status</th><th>Estoque</th><th>Tipo</th><th>Fabricante</th><th>Atualizado</th></tr></thead>
              <tbody>{data.products.map((product) => (
                <tr key={product.shopifyId} className="product-row-clickable" tabIndex={0} role="button" onClick={() => setSelectedId(product.shopifyId)} onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(product.shopifyId); }
                }}>
                  <td className="product-image-cell"><span className="shopify-product-image">{product.imageUrl ? <img src={product.imageUrl} alt={product.imageAlt || product.title} /> : <PackageSearch size={20} />}</span></td>
                  <td><strong>{product.title}</strong>{product.variants.length > 1 && <small className="shopify-variant-count">{product.variants.length} variações</small>}</td>
                  <td><strong>{product.sku || "-"}</strong></td>
                  <td><span className={`shopify-status shopify-status-${product.status.toLowerCase()}`}>{statusLabel[product.status] || product.status}</span></td>
                  <td>{product.totalInventory.toLocaleString("pt-BR")}</td>
                  <td>{product.productType || "-"}</td>
                  <td>{product.vendor || "-"}</td>
                  <td>{product.shopifyUpdatedAt ? new Date(product.shopifyUpdatedAt).toLocaleString("pt-BR") : "-"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {data && data.totalPages > 1 && <div className="products-pagination">
          <span>Página {data.page} de {data.totalPages}</span>
          <div className="pagination">
            <button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="Página anterior"><ChevronLeft size={16} /></button>
            <strong>{page} / {data.totalPages}</strong>
            <button type="button" disabled={page >= data.totalPages} onClick={() => setPage((value) => value + 1)} aria-label="Próxima página"><ChevronRight size={16} /></button>
          </div>
        </div>}
      </section>
    </>
  );
}
