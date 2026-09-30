"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronLeft, ChevronRight, Columns3, LoaderCircle, PackageSearch, Plus, Search, X } from "lucide-react";
import { ProductDetailsDrawer, type UpdatedProduct } from "@/components/ProductDetailsDrawer";
import type { ShopifyCatalogProduct } from "@/lib/auth";
import type { HistoryRow } from "@/lib/types";

type Facets = { vendors: string[]; productTypes: string[]; statuses: string[]; tags: string[]; collections: string[] };
type CatalogResponse = { products: ShopifyCatalogProduct[]; page: number; perPage: number; total: number; totalPages: number; facets?: Facets; permissions?: { canEditProducts: boolean }; error?: string };
type FilterKey = "vendor" | "tag" | "status" | "productType" | "collection";
const filterLabels: Record<FilterKey, string> = { vendor: "Fabricante", tag: "Tag", status: "Status", productType: "Tipo de produto", collection: "Coleção" };
const statusLabel: Record<string, string> = { ACTIVE: "Ativo", DRAFT: "Rascunho", ARCHIVED: "Arquivado" };

function toHistoryRow(product: ShopifyCatalogProduct): HistoryRow {
  return { dataHora: product.shopifyUpdatedAt ? new Date(product.shopifyUpdatedAt).toLocaleString("pt-BR") : "-", sku: product.sku, marca: product.vendor, tituloAntes: product.title, tituloDepois: product.title, tagsAntes: product.tags.join(", "), tagsDepois: product.tags.join(", "), colecoesAntes: product.collections.join(", "), colecoesDepois: product.collections.join(", "), tituloAlterado: false, tagsAlteradas: false, colecoesAlteradas: false, descricaoGerada: false, status: product.status === "ACTIVE" ? "Sucesso" : product.status };
}

function FilterPicker({ facets, filters, onChange }: { facets?: Facets; filters: Partial<Record<FilterKey, string>>; onChange: (key: FilterKey, value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FilterKey | null>(null);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) { setOpen(false); setKind(null); } };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const options = kind === "vendor" ? facets?.vendors : kind === "tag" ? facets?.tags : kind === "status" ? facets?.statuses : kind === "productType" ? facets?.productTypes : kind === "collection" ? facets?.collections : [];
  const visible = (options || []).filter((value) => value.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
  return <div className="catalog-filter-picker" ref={ref}>
    <button className="catalog-add-filter" type="button" onClick={() => { setOpen((value) => !value); setKind(null); setSearch(""); }}><Plus size={14} /> Adicionar filtro</button>
    {open && <div className="catalog-filter-popover">
      {!kind ? (Object.keys(filterLabels) as FilterKey[]).map((key) => <button type="button" key={key} onClick={() => setKind(key)}>{filterLabels[key]}<ChevronRight size={14} /></button>) : <>
        <div className="catalog-filter-popover-head"><button type="button" onClick={() => { setKind(null); setSearch(""); }}><ChevronLeft size={15} /></button><strong>{filterLabels[kind]}</strong></div>
        <label className="catalog-filter-option-search"><Search size={14} /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Pesquisar ${filterLabels[kind].toLowerCase()}`} /></label>
        <div className="catalog-filter-options">{visible.map((value) => <button type="button" key={value} onClick={() => { onChange(kind, value); setOpen(false); setKind(null); }}><span className={`catalog-filter-checkbox ${filters[kind] === value ? "is-checked" : ""}`}>{filters[kind] === value && <Check size={12} />}</span>{kind === "status" ? statusLabel[value] || value : value}</button>)}</div>
      </>}
    </div>}
  </div>;
}

export function ShopifyProductsClient() {
  const [data, setData] = useState<CatalogResponse | null>(null);
  const [facets, setFacets] = useState<Facets>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Partial<Record<FilterKey, string>>>({});
  const [sort, setSort] = useState<"updated" | "title" | "title_desc">("updated");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ page: String(page), perPage: "50", sort, facets: "1" });
      if (query) params.set("q", query);
      Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
      const response = await fetch(`/api/shopify-products?${params}`, { cache: "no-store" });
      const result = (await response.json()) as CatalogResponse;
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar o catálogo.");
      setData(result); if (result.facets) setFacets(result.facets);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao carregar o catálogo."); }
    finally { setLoading(false); }
  }, [filters, page, query, sort]);
  useEffect(() => void load(), [load]);
  const selected = useMemo(() => data?.products.find((product) => product.shopifyId === selectedId) || null, [data, selectedId]);
  const setFilter = (key: FilterKey, value: string) => { setFilters((current) => ({ ...current, [key]: value })); setPage(1); };
  const removeFilter = (key: FilterKey) => { setFilters((current) => { const next = { ...current }; delete next[key]; return next; }); setPage(1); };
  const updateProduct = (updated: UpdatedProduct) => setData((current) => current ? { ...current, products: current.products.map((product) => product.shopifyId === selectedId ? { ...product, title: updated.title, tags: updated.tags, collections: updated.collections } : product) } : current);
  const toggleProductSort = () => {
    setSort((current) => current === "title" ? "title_desc" : "title");
    setPage(1);
  };

  return <>
    <ProductDetailsDrawer row={selected ? toHistoryRow(selected) : null} canEdit={Boolean(data?.permissions?.canEditProducts)} onClose={() => setSelectedId(null)} onProductUpdated={(_, product) => updateProduct(product)} />
    <div className="page-head dashboard-title-row"><div><h1 className="page-title">Produtos</h1><div className="page-sub">Todos os produtos sincronizados do Shopify.</div></div></div>
    <section className="shopify-products-workspace">
      <form className="shopify-products-commandbar" onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(search.trim()); }}>
        <div className="catalog-status-picker"><button type="button"><span>{filters.status ? statusLabel[filters.status] || filters.status : "Todos"}</span><ChevronDown size={14} /></button><div className="catalog-status-menu">{["", "ACTIVE", "DRAFT", "ARCHIVED"].map((value) => <button type="button" key={value || "all"} onClick={() => value ? setFilter("status", value) : removeFilter("status")}><span>{(filters.status || "") === value && <Check size={13} />}</span>{value ? statusLabel[value] : "Todos"}</button>)}</div></div>
        <label className="shopify-command-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar e filtrar" /></label>
        <FilterPicker facets={facets} filters={filters} onChange={setFilter} />
        <button className="catalog-columns-button" type="button" aria-label="Colunas"><Columns3 size={17} /></button>
      </form>
      {Object.keys(filters).some((key) => key !== "status" && filters[key as FilterKey]) && <div className="catalog-filter-chips">{(Object.entries(filters) as Array<[FilterKey, string]>).filter(([key, value]) => key !== "status" && value).map(([key, value]) => <span key={key}><b>{filterLabels[key]}:</b> {value}<button type="button" onClick={() => removeFilter(key)} aria-label={`Remover filtro ${filterLabels[key]}`}><X size={12} /></button></span>)}</div>}
      <div className="shopify-products-count">{(data?.total || 0).toLocaleString("pt-BR")} produtos</div>
      {loading ? <div className="shopify-catalog-state"><LoaderCircle className="spin" size={28} /><strong>Carregando produtos</strong></div> : error ? <div className="shopify-catalog-state is-error"><strong>Não foi possível carregar</strong><span>{error}</span><button className="btn" onClick={load}>Tentar novamente</button></div> : !data?.products.length ? <div className="shopify-catalog-state"><PackageSearch size={34} /><strong>Nenhum produto encontrado</strong><span>Altere a pesquisa ou os filtros selecionados.</span></div> : <div className="shopify-products-table"><table><thead><tr><th><input type="checkbox" aria-label="Selecionar todos" /></th><th><button className={`catalog-sort-heading ${sort !== "updated" ? "is-active" : ""}`} type="button" onClick={toggleProductSort} title={sort === "title" ? "Ordenar de Z a A" : "Ordenar de A a Z"}>Produto{sort === "title" ? <ArrowUp size={13} /> : sort === "title_desc" ? <ArrowDown size={13} /> : null}</button></th><th>Status</th><th>Estoque</th><th>SKU</th><th>Tipo de produto</th><th>Fabricante</th></tr></thead><tbody>{data.products.map((product) => <tr key={product.shopifyId} tabIndex={0} role="button" onClick={() => setSelectedId(product.shopifyId)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(product.shopifyId); } }}><td onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={`Selecionar ${product.title}`} /></td><td><div className="shopify-product-main"><span className="shopify-product-image">{product.imageUrl ? <img src={product.imageUrl} alt={product.imageAlt || product.title} /> : <PackageSearch size={18} />}</span><strong>{product.title}</strong></div></td><td><span className={`shopify-status shopify-status-${product.status.toLowerCase()}`}>{statusLabel[product.status] || product.status}</span></td><td className={product.totalInventory <= 0 ? "is-out-of-stock" : ""}>{product.totalInventory.toLocaleString("pt-BR")} em estoque</td><td>{product.sku || "-"}</td><td>{product.productType || "-"}</td><td>{product.vendor || "-"}</td></tr>)}</tbody></table></div>}
      {data && data.totalPages > 1 && <div className="shopify-products-pagination"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={16} /></button><span>{((data.page - 1) * data.perPage + 1).toLocaleString("pt-BR")}–{Math.min(data.page * data.perPage, data.total).toLocaleString("pt-BR")}</span><button type="button" disabled={page >= data.totalPages} onClick={() => setPage((value) => value + 1)}><ChevronRight size={16} /></button></div>}
    </section>
  </>;
}
