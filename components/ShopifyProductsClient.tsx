"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  EyeOff,
  Layers3,
  LoaderCircle,
  MoreHorizontal,
  PackageSearch,
  Plus,
  RefreshCcw,
  Search,
  Tag,
  Trash2,
  Workflow,
  X,
} from "lucide-react";
import type { UpdatedProduct } from "@/components/ProductDetailsDrawer";
import { useProductPanel } from "@/components/ProductPanelProvider";
import { setCachedProductImage } from "@/components/ProductThumbnail";
import { loadProductDetails } from "@/components/ProductDetailsCache";
import type { ShopifyCatalogProduct } from "@/lib/auth";
import type { HistoryRow } from "@/lib/types";

type Facets = {
  vendors: string[];
  productTypes: string[];
  statuses: string[];
  tags: string[];
  collections: string[];
};
type CatalogResponse = {
  products: ShopifyCatalogProduct[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  facets?: Facets;
  permissions?: { canEditProducts: boolean };
  error?: string;
};
type FilterKey = "vendor" | "tag" | "status" | "productType" | "collection";
type BulkAction = "archive" | "unpublish" | "delete";
const filterLabels: Record<FilterKey, string> = {
  vendor: "Fabricante",
  tag: "Tag",
  status: "Status",
  productType: "Tipo de produto",
  collection: "Coleção",
};
const statusLabel: Record<string, string> = {
  ACTIVE: "Ativo",
  DRAFT: "Rascunho",
  ARCHIVED: "Arquivado",
};
const winthorStatusLabel: Record<string, string> = {
  ATIVO: "Ativo",
  FORA_DE_LINHA: "Fora de linha",
  PENDENTE: "Aguardando sincronização",
};

function toHistoryRow(product: ShopifyCatalogProduct): HistoryRow {
  return {
    dataHora: product.shopifyUpdatedAt
      ? new Date(product.shopifyUpdatedAt).toLocaleString("pt-BR")
      : "-",
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

function FilterPicker({
  facets,
  filters,
  onChange,
}: {
  facets?: Facets;
  filters: Partial<Record<FilterKey, string>>;
  onChange: (key: FilterKey, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FilterKey | null>(null);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        setOpen(false);
        setKind(null);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const options =
    kind === "vendor"
      ? facets?.vendors
      : kind === "tag"
        ? facets?.tags
        : kind === "status"
          ? facets?.statuses
          : kind === "productType"
            ? facets?.productTypes
            : kind === "collection"
              ? facets?.collections
              : [];
  const visible = (options || []).filter((value) =>
    value
      .toLocaleLowerCase("pt-BR")
      .includes(search.toLocaleLowerCase("pt-BR")),
  );
  return (
    <div className="catalog-filter-picker" ref={ref}>
      <button
        className="catalog-add-filter"
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          setKind(null);
          setSearch("");
        }}
      >
        <Plus size={14} /> Adicionar filtro
      </button>
      {open && (
        <div className="catalog-filter-popover">
          {!kind ? (
            (Object.keys(filterLabels) as FilterKey[]).map((key) => (
              <button type="button" key={key} onClick={() => setKind(key)}>
                {filterLabels[key]}
                <ChevronRight size={14} />
              </button>
            ))
          ) : (
            <>
              <div className="catalog-filter-popover-head">
                <button
                  type="button"
                  onClick={() => {
                    setKind(null);
                    setSearch("");
                  }}
                >
                  <ChevronLeft size={15} />
                </button>
                <strong>{filterLabels[kind]}</strong>
              </div>
              <label className="catalog-filter-option-search">
                <Search size={14} />
                <input
                  autoFocus
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={`Pesquisar ${filterLabels[kind].toLowerCase()}`}
                />
              </label>
              <div className="catalog-filter-options">
                {visible.map((value) => (
                  <button
                    type="button"
                    key={value}
                    onClick={() => {
                      onChange(kind, value);
                      setOpen(false);
                      setKind(null);
                    }}
                  >
                    <span
                      className={`catalog-filter-checkbox ${filters[kind] === value ? "is-checked" : ""}`}
                    >
                      {filters[kind] === value && <Check size={12} />}
                    </span>
                    {kind === "status" ? statusLabel[value] || value : value}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function ShopifyProductsClient({
  winthorOnly = false,
}: {
  winthorOnly?: boolean;
}) {
  const { openProduct } = useProductPanel();
  const [data, setData] = useState<CatalogResponse | null>(null);
  const [facets, setFacets] = useState<Facets>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Partial<Record<FilterKey, string>>>(
    {},
  );
  const [sort, setSort] = useState<"updated" | "title" | "title_desc">(
    "updated",
  );
  const [page, setPage] = useState(1);
  const [selectedProducts, setSelectedProducts] = useState<
    Record<string, ShopifyCatalogProduct>
  >({});
  const [automationRunning, setAutomationRunning] = useState(false);
  const [bulkActionRunning, setBulkActionRunning] = useState<BulkAction | null>(
    null,
  );
  const [automationMessage, setAutomationMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const refreshInProgress = useRef(false);

  const load = useCallback(
    async (background = false) => {
      if (background && refreshInProgress.current) return;
      if (background) {
        refreshInProgress.current = true;
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError("");
      try {
        const params = new URLSearchParams({
          page: String(page),
          perPage: "50",
          sort,
          facets: "1",
        });
        if (query) params.set("q", query);
        if (winthorOnly) params.set("winthorStatus", "FORA_DE_LINHA");
        Object.entries(filters).forEach(([key, value]) => {
          if (value) params.set(key, value);
        });
        const response = await fetch(`/api/shopify-products?${params}`, {
          cache: "no-store",
        });
        const result = (await response.json()) as CatalogResponse;
        if (!response.ok)
          throw new Error(
            result.error || "Não foi possível carregar o catálogo.",
          );
        result.products.forEach((product) => {
          if (!product.sku || !product.imageUrl) return;
          setCachedProductImage(
            product.sku,
            { url: product.imageUrl, alt: product.imageAlt || product.title },
            product.title,
          );
        });
        setData(result);
        setLastRefreshAt(new Date().toISOString());
        if (result.facets) setFacets(result.facets);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Erro ao carregar o catálogo.",
        );
      } finally {
        if (background) {
          refreshInProgress.current = false;
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [filters, page, query, sort, winthorOnly],
  );
  useEffect(() => void load(), [load]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [load]);
  useEffect(() => setSelectedProducts({}), [filters, query, sort]);
  useEffect(() => {
    if (
      page !== 1 ||
      query ||
      sort !== "updated" ||
      Object.keys(filters).length > 0 ||
      !data?.permissions?.canEditProducts ||
      !data.products.length
    )
      return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      for (const product of data.products) {
        if (cancelled) break;
        if (!product.sku) continue;
        try {
          await loadProductDetails(product.sku, product.title);
        } catch {
          // Uma falha isolada não interrompe o pré-carregamento da página.
        }
        await new Promise((resolve) => window.setTimeout(resolve, 350));
      }
    }, 1500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [data, filters, page, query, sort]);
  const setFilter = (key: FilterKey, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };
  const removeFilter = (key: FilterKey) => {
    setFilters((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setPage(1);
  };
  const updateProduct = (productId: string, updated: UpdatedProduct) =>
    setData((current) =>
      current
        ? {
            ...current,
            products: current.products.map((product) =>
              product.shopifyId === productId
                ? {
                    ...product,
                    title: updated.title,
                    tags: updated.tags,
                    collections: updated.collections,
                  }
                : product,
            ),
          }
        : current,
    );
  const openProductDetails = (product: ShopifyCatalogProduct) =>
    openProduct(
      toHistoryRow(product),
      Boolean(data?.permissions?.canEditProducts),
      (_, updated) => updateProduct(product.shopifyId, updated),
    );
  const toggleProductSort = () => {
    setSort((current) => (current === "title" ? "title_desc" : "title"));
    setPage(1);
  };
  const selectedIds = Object.keys(selectedProducts);
  const selectedProductsList = Object.values(selectedProducts);
  const visibleIds = data?.products.map((product) => product.shopifyId) || [];
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.includes(id));
  const toggleAllVisible = () =>
    setSelectedProducts((current) => {
      const next = { ...current };
      if (allVisibleSelected) {
        visibleIds.forEach((id) => delete next[id]);
      } else {
        data?.products.forEach((product) => {
          next[product.shopifyId] = product;
        });
      }
      return next;
    });
  const toggleSelected = (product: ShopifyCatalogProduct) =>
    setSelectedProducts((current) => {
      const next = { ...current };
      if (next[product.shopifyId]) delete next[product.shopifyId];
      else next[product.shopifyId] = product;
      return next;
    });
  const runSelectedAutomation = async () => {
    if (automationRunning || bulkActionRunning || !selectedIds.length) return;

    setAutomationRunning(true);
    setAutomationMessage(null);

    let successes = 0;
    let failures = 0;
    const failureMessages: string[] = [];

    const processProduct = async (product: ShopifyCatalogProduct) => {
      if (!product.sku)
        return {
          ok: false as const,
          error: `${product.title}: produto sem SKU.`,
        };

      try {
        const response = await fetch("/api/n8n/product-automation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sku: product.sku,
            titulo: product.title,
            shopifyProductId: product.shopifyId,
          }),
        });

        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.ok)
          throw new Error(result?.error || "Falha ao iniciar automação.");

        const maxAttempts = 160;
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 3000));
          const statusResponse = await fetch(
            `/api/n8n/product-automation/status?request_id=${encodeURIComponent(result.requestId)}`,
            { cache: "no-store" },
          );
          const statusJson = await statusResponse.json().catch(() => null);
          if (!statusResponse.ok)
            throw new Error(
              statusJson?.error ||
                "Não foi possível consultar o status da automação.",
            );
          if (statusJson?.completed) return { ok: true as const };
        }

        throw new Error(
          "A automação ainda não concluiu o produto dentro do tempo esperado.",
        );
      } catch (cause) {
        return {
          ok: false as const,
          error: `${product.title}: ${
            cause instanceof Error
              ? cause.message
              : "Falha ao iniciar automação."
          }`,
        };
      }
    };

    // Lote rígido: envia até 5 e espera TODOS terminarem.
    // Somente então libera o próximo grupo de até 5.
    for (let index = 0; index < selectedProductsList.length; index += 5) {
      const batch = selectedProductsList.slice(index, index + 5);
      const results = await Promise.all(batch.map(processProduct));
      for (const result of results) {
        if (result.ok) successes += 1;
        else {
          failures += 1;
          failureMessages.push(result.error);
        }
      }
    }

    setAutomationRunning(false);

    if (!failures) {
      setSelectedProducts({});
      setAutomationMessage({
        tone: "success",
        text: `${successes} ${
          successes === 1 ? "produto processado" : "produtos processados"
        } pela automação em lotes de até 5.`,
      });
    } else {
      setAutomationMessage({
        tone: "error",
        text: `Automação concluída para ${successes}; ${failures} ${
          failures === 1 ? "produto falhou" : "produtos falharam"
        }. ${failureMessages.join(" ")}`,
      });
    }
  };

  const runBulkAction = async (action: BulkAction) => {
    if (automationRunning || bulkActionRunning || !selectedProductsList.length)
      return;

    const count = selectedProductsList.length;
    const plural = count === 1 ? "produto" : "produtos";
    if (action === "delete") {
      const confirmation = window.prompt(
        `A exclusão de ${count} ${plural} é permanente no Shopify. Digite EXCLUIR para continuar.`,
      );
      if (confirmation !== "EXCLUIR") return;
    } else {
      const message =
        action === "archive"
          ? `Arquivar ${count} ${plural} no Shopify?`
          : `Remover ${count} ${plural} de todos os canais de venda?`;
      if (!window.confirm(message)) return;
    }

    setBulkActionRunning(action);
    setAutomationMessage(null);
    try {
      const response = await fetch("/api/n8n/product-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          products: selectedProductsList.map((product) => ({
            shopifyId: product.shopifyId,
            sku: product.sku,
            title: product.title,
          })),
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok)
        throw new Error(result?.error || "Não foi possível concluir a ação.");

      setSelectedProducts({});
      setAutomationMessage({
        tone: "success",
        text:
          result.message ||
          `${count} ${plural} ${count === 1 ? "foi atualizado" : "foram atualizados"} no Shopify.`,
      });
      await load();
    } catch (cause) {
      setAutomationMessage({
        tone: "error",
        text:
          cause instanceof Error
            ? cause.message
            : "Não foi possível concluir a ação.",
      });
    } finally {
      setBulkActionRunning(null);
    }
  };

  return (
    <>
      <div className="page-head dashboard-title-row">
        <div>
          <h1 className="page-title">
            {winthorOnly ? "Produtos fora de linha" : "Produtos"}
          </h1>
          <div className="page-sub">
            {winthorOnly
              ? "Produtos marcados como fora de linha na última sincronização do WinThor."
              : "Todos os produtos sincronizados do Shopify."}
          </div>
        </div>
      </div>
      <section className="shopify-products-workspace">
        <form
          className="shopify-products-commandbar"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setQuery(search.trim());
          }}
        >
          <div className="catalog-status-picker">
            <button type="button">
              <span>
                {filters.status
                  ? statusLabel[filters.status] || filters.status
                  : "Todos"}
              </span>
              <ChevronDown size={14} />
            </button>
            <div className="catalog-status-menu">
              {["", "ACTIVE", "DRAFT", "ARCHIVED"].map((value) => (
                <button
                  type="button"
                  key={value || "all"}
                  onClick={() =>
                    value ? setFilter("status", value) : removeFilter("status")
                  }
                >
                  <span>
                    {(filters.status || "") === value && <Check size={13} />}
                  </span>
                  {value ? statusLabel[value] : "Todos"}
                </button>
              ))}
            </div>
          </div>
          <label className="shopify-command-search">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar e filtrar"
            />
          </label>
          <FilterPicker
            facets={facets}
            filters={filters}
            onChange={setFilter}
          />
          <button
            className="catalog-columns-button"
            type="button"
            aria-label="Colunas"
          >
            <Columns3 size={17} />
          </button>
        </form>
        {Object.keys(filters).some(
          (key) => key !== "status" && filters[key as FilterKey],
        ) && (
          <div className="catalog-filter-chips">
            {(Object.entries(filters) as Array<[FilterKey, string]>)
              .filter(([key, value]) => key !== "status" && value)
              .map(([key, value]) => (
                <span key={key}>
                  <b>{filterLabels[key]}:</b> {value}
                  <button
                    type="button"
                    onClick={() => removeFilter(key)}
                    aria-label={`Remover filtro ${filterLabels[key]}`}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
          </div>
        )}
        <div
          className={`shopify-products-selectionbar ${selectedIds.length ? "has-selection" : ""}`}
        >
          {selectedIds.length > 0 ? (
            <div className="selected-products-actions">
              <details className="selected-products-menu">
                <summary>
                  {selectedIds.length}{" "}
                  {selectedIds.length === 1 ? "produto" : "produtos"}
                  <ChevronDown size={14} />
                </summary>
                <div>
                  <button type="button" onClick={() => setSelectedProducts({})}>
                    Desmarcar todos
                  </button>
                </div>
              </details>
              <button
                className="run-flow-automation"
                type="button"
                onClick={runSelectedAutomation}
                disabled={automationRunning || Boolean(bulkActionRunning)}
              >
                {automationRunning ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Workflow size={17} />
                )}
                {automationRunning
                  ? "Rodando Automação..."
                  : "Run Flow automation"}
              </button>
            </div>
          ) : (
            <span>{(data?.total || 0).toLocaleString("pt-BR")} produtos</span>
          )}
          <div className="shopify-products-table-actions">
            {sort !== "updated" && (
              <button
                className="catalog-reset-sort"
                type="button"
                onClick={() => {
                  setSort("updated");
                  setPage(1);
                }}
                title="Voltar para última alteração"
                aria-label="Voltar para ordenação por última alteração"
              >
                <RefreshCcw size={16} />
              </button>
            )}
            <button
              className="catalog-reset-sort"
              type="button"
              onClick={() => void load(true)}
              disabled={loading || refreshing}
              title={
                lastRefreshAt
                  ? `Atualizar painel · última atualização às ${new Date(lastRefreshAt).toLocaleTimeString("pt-BR")}`
                  : "Atualizar painel"
              }
              aria-label="Atualizar painel"
            >
              {refreshing ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <RefreshCcw size={16} />
              )}
            </button>
            <details className="catalog-bulk-menu">
              <summary aria-label="Mais ações">
                <MoreHorizontal size={18} />
              </summary>
              <div>
                <button
                  type="button"
                  disabled={!selectedIds.length || Boolean(bulkActionRunning)}
                  onClick={() => runBulkAction("archive")}
                >
                  <Archive size={15} />
                  {bulkActionRunning === "archive"
                    ? "Arquivando produtos..."
                    : "Arquivar produtos"}
                </button>
                <button
                  type="button"
                  disabled={!selectedIds.length || Boolean(bulkActionRunning)}
                  onClick={() => runBulkAction("unpublish")}
                >
                  <EyeOff size={15} />
                  {bulkActionRunning === "unpublish"
                    ? "Removendo dos canais..."
                    : "Remover produtos das listas"}
                </button>
                <button
                  className="is-danger"
                  type="button"
                  disabled={!selectedIds.length || Boolean(bulkActionRunning)}
                  onClick={() => runBulkAction("delete")}
                >
                  <Trash2 size={15} />
                  {bulkActionRunning === "delete"
                    ? "Excluindo produtos..."
                    : "Excluir produtos"}
                </button>
                <hr />
              </div>
            </details>
          </div>
        </div>
        {automationMessage && (
          <div
            className={`catalog-automation-message is-${automationMessage.tone}`}
            role="status"
          >
            <span>{automationMessage.text}</span>
            <button
              type="button"
              onClick={() => setAutomationMessage(null)}
              aria-label="Fechar aviso"
            >
              <X size={13} />
            </button>
          </div>
        )}
        {error && data && (
          <div className="catalog-automation-message is-error" role="status">
            <span>{error}</span>
          </div>
        )}
        {loading ? (
          <div className="shopify-catalog-state">
            <LoaderCircle className="spin" size={28} />
            <strong>Carregando produtos</strong>
          </div>
        ) : error && !data ? (
          <div className="shopify-catalog-state is-error">
            <strong>Não foi possível carregar</strong>
            <span>{error}</span>
            <button className="btn" onClick={() => void load()}>
              Tentar novamente
            </button>
          </div>
        ) : !data?.products.length ? (
          <div className="shopify-catalog-state">
            <PackageSearch size={34} />
            <strong>Nenhum produto encontrado</strong>
            <span>Altere a pesquisa ou os filtros selecionados.</span>
          </div>
        ) : (
          <div className="shopify-products-table">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      ref={(input) => {
                        if (input)
                          input.indeterminate =
                            someVisibleSelected && !allVisibleSelected;
                      }}
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                      aria-label="Selecionar todos os produtos desta página"
                    />
                  </th>
                  <th>
                    <button
                      className={`catalog-sort-heading ${sort !== "updated" ? "is-active" : ""}`}
                      type="button"
                      onClick={toggleProductSort}
                      title={
                        sort === "title"
                          ? "Ordenar de Z a A"
                          : "Ordenar de A a Z"
                      }
                    >
                      Produto
                      {sort === "title" ? (
                        <ArrowUp size={13} />
                      ) : sort === "title_desc" ? (
                        <ArrowDown size={13} />
                      ) : null}
                    </button>
                  </th>
                  <th>Status Shopify</th>
                  <th>Status WinThor</th>
                  <th>Estoque</th>
                  <th>SKU</th>
                  <th>Tipo de produto</th>
                  <th>Fabricante</th>
                </tr>
              </thead>
              <tbody>
                {data.products.map((product) => (
                  <tr
                    className={
                      selectedIds.includes(product.shopifyId)
                        ? "is-selected"
                        : ""
                    }
                    key={product.shopifyId}
                    tabIndex={0}
                    role="button"
                    onClick={() => openProductDetails(product)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openProductDetails(product);
                      }
                    }}
                  >
                    <td onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(product.shopifyId)}
                        onChange={() => toggleSelected(product)}
                        aria-label={`Selecionar ${product.title}`}
                      />
                    </td>
                    <td>
                      <div className="shopify-product-main">
                        <span className="shopify-product-image">
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={product.imageAlt || product.title}
                            />
                          ) : (
                            <PackageSearch size={18} />
                          )}
                        </span>
                        <strong>{product.title}</strong>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`shopify-status shopify-status-${product.status.toLowerCase()}`}
                      >
                        {statusLabel[product.status] || product.status}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`winthor-status winthor-status-${product.winthorStatus.toLowerCase()}`}
                        title={
                          product.winthorDescription ||
                          winthorStatusLabel[product.winthorStatus]
                        }
                      >
                        {winthorStatusLabel[product.winthorStatus] ||
                          product.winthorStatus}
                      </span>
                    </td>
                    <td
                      className={
                        product.totalInventory <= 0 ? "is-out-of-stock" : ""
                      }
                    >
                      {product.totalInventory.toLocaleString("pt-BR")} em
                      estoque
                    </td>
                    <td>{product.sku || "-"}</td>
                    <td>{product.productType || "-"}</td>
                    <td>{product.vendor || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.totalPages > 1 && (
          <div className="shopify-products-pagination">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              {((data.page - 1) * data.perPage + 1).toLocaleString("pt-BR")}–
              {Math.min(data.page * data.perPage, data.total).toLocaleString(
                "pt-BR",
              )}
            </span>
            <button
              type="button"
              disabled={page >= data.totalPages}
              onClick={() => setPage((value) => value + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </section>
    </>
  );
}
