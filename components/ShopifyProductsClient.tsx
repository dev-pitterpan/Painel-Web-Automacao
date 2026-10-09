"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
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
  Store,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import type { UpdatedProduct } from "@/components/ProductDetailsDrawer";
import { useAutomationProgress } from "@/components/AutomationProgressProvider";
import {
  productRowKey,
  useProductPanel,
} from "@/components/ProductPanelProvider";
import { setCachedProductImage } from "@/components/ProductThumbnail";
import { invalidateProductDetails } from "@/components/ProductDetailsCache";
import type { ShopifyCatalogProduct } from "@/lib/auth";
import type { HistoryRow } from "@/lib/types";
import {
  NotificationCenter,
  type NotificationItem,
} from "@/components/NotificationCenter";
import { SkuNotFoundModal } from "@/components/SkuNotFoundModal";
import { missingSkuTerms, multipleSkuTerms } from "@/lib/search";

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
  processingHistoryBySku?: Record<string, HistoryRow>;
  error?: string;
};
type FilterKey = "vendor" | "tag" | "status" | "productType" | "collection";
type BulkAction = "archive" | "unpublish" | "delete";
type ChannelBulkAction = "publish" | "unpublish";
type SalesChannel = { id: string; name: string };
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

function toHistoryRow(
  product: ShopifyCatalogProduct,
  processingHistory?: HistoryRow,
): HistoryRow {
  if (processingHistory) {
    return {
      ...processingHistory,
      shopifyId: product.shopifyId,
      marca: product.vendor || processingHistory.marca,
      tipoProduto: product.productType,
      tituloDepois: product.title || processingHistory.tituloDepois,
      tagsDepois: product.tags.join(", "),
      colecoesDepois: product.collections.join(", "),
    };
  }
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
  const { activeProductKey, openProduct } = useProductPanel();
  const automationProgress = useAutomationProgress();
  const [data, setData] = useState<CatalogResponse | null>(null);
  const [facets, setFacets] = useState<Facets>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [missingSkus, setMissingSkus] = useState<string[]>([]);
  const [filters, setFilters] = useState<Partial<Record<FilterKey, string>>>(
    {},
  );
  const [sort, setSort] = useState<"updated" | "title">("updated");
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
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [channelBulkAction, setChannelBulkAction] =
    useState<ChannelBulkAction | null>(null);
  const [salesChannels, setSalesChannels] = useState<SalesChannel[]>([]);
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [channelSearch, setChannelSearch] = useState("");
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [channelsSaving, setChannelsSaving] = useState(false);
  const [channelsError, setChannelsError] = useState("");
  const refreshInProgress = useRef(false);
  const loadRequestId = useRef(0);

  const addNotification = useCallback(
    (tone: NotificationItem["tone"], message: string) => {
      setNotifications((current) =>
        [
          {
            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            tone,
            message,
            createdAt: new Date().toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            }),
          },
          ...current,
        ].slice(0, 20),
      );
    },
    [],
  );

  const load = useCallback(
    async (background = false, notify = false) => {
      if (background && refreshInProgress.current) return;
      const requestId = ++loadRequestId.current;
      if (background) {
        refreshInProgress.current = true;
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError("");
      try {
        const skuTerms = multipleSkuTerms(query);
        const params = new URLSearchParams({
          page: String(page),
          perPage: skuTerms.length ? "500" : "50",
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
        if (requestId !== loadRequestId.current) return;
        result.products.forEach((product) => {
          if (!product.sku || !product.imageUrl) return;
          setCachedProductImage(
            product.sku,
            { url: product.imageUrl, alt: product.imageAlt || product.title },
            product.title,
          );
        });
        setData(result);
        if (!background) {
          setMissingSkus(
            missingSkuTerms(
              query,
              result.products.flatMap((product) => [
                product.sku,
                ...product.variants.map((variant) => variant.sku),
              ]),
            ),
          );
        }
        setLastRefreshAt(new Date().toISOString());
        if (result.facets) setFacets(result.facets);
        if (notify)
          addNotification("success", "Catálogo atualizado com sucesso.");
      } catch (cause) {
        if (requestId !== loadRequestId.current) return;
        const message =
          cause instanceof Error
            ? cause.message
            : "Erro ao carregar o catálogo.";
        setError(message);
        if (notify) addNotification("error", message);
      } finally {
        if (background) {
          refreshInProgress.current = false;
          setRefreshing(false);
        } else if (requestId === loadRequestId.current) {
          setLoading(false);
        }
      }
    },
    [addNotification, filters, page, query, sort, winthorOnly],
  );
  useEffect(() => void load(), [load]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [load]);
  useEffect(() => setSelectedProducts({}), [filters, query, sort]);
  const visibleMissingSkus = useMemo(() => {
    const found = new Set(
      (data?.products || [])
        .flatMap((product) => [
          product.sku,
          ...product.variants.map((variant) => variant.sku),
        ])
        .map((sku) =>
          String(sku || "")
            .trim()
            .toLocaleLowerCase("pt-BR"),
        ),
    );
    return missingSkus.filter(
      (sku) => !found.has(sku.trim().toLocaleLowerCase("pt-BR")),
    );
  }, [data, missingSkus]);
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
  const historyForProduct = (product: ShopifyCatalogProduct) =>
    data?.processingHistoryBySku?.[
      product.sku.trim().toLocaleLowerCase("pt-BR")
    ];
  const productHistoryRow = (product: ShopifyCatalogProduct) =>
    toHistoryRow(product, historyForProduct(product));
  const openProductDetails = (product: ShopifyCatalogProduct) =>
    openProduct(
      productHistoryRow(product),
      Boolean(data?.permissions?.canEditProducts),
      (_, updated) => updateProduct(product.shopifyId, updated),
    );
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
    automationProgress.start(selectedProductsList.length);

    let successes = 0;
    let failures = 0;
    const failureMessages: string[] = [];

    const enqueueProduct = async (product: ShopifyCatalogProduct) => {
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

        return {
          ok: true as const,
          requestId: String(result.requestId),
          title: product.title,
        };
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

    const waitForProduct = async (requestId: string, title: string) => {
      try {
        const maxAttempts = 320;
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 3000));
          const statusResponse = await fetch(
            `/api/n8n/product-automation/status?request_id=${encodeURIComponent(requestId)}`,
            { cache: "no-store" },
          );
          const statusJson = await statusResponse.json().catch(() => null);
          if (!statusResponse.ok)
            throw new Error(
              statusJson?.error ||
                "Não foi possível consultar o status da automação.",
            );
          if (statusJson?.completed) {
            const succeeded = statusJson?.succeeded !== false;
            automationProgress.productFinished(succeeded);
            return succeeded
              ? { ok: true as const }
              : {
                  ok: false as const,
                  error: `${title}: o processamento terminou com erro.`,
                };
          }
        }

        throw new Error(
          "A automação ainda não concluiu o produto dentro do tempo esperado.",
        );
      } catch (cause) {
        automationProgress.productFinished(false);
        return {
          ok: false as const,
          error: `${title}: ${
            cause instanceof Error
              ? cause.message
              : "Falha ao acompanhar a automação."
          }`,
        };
      }
    };

    const queued: Array<{ requestId: string; title: string }> = [];

    // Enfileira todos rapidamente, limitando apenas o pico de requisições HTTP.
    // O n8n mantém cinco workers e cada worker busca o próximo item ao terminar.
    for (let index = 0; index < selectedProductsList.length; index += 5) {
      const batch = selectedProductsList.slice(index, index + 5);
      const enqueueResults = await Promise.all(batch.map(enqueueProduct));
      for (const result of enqueueResults) {
        if (result.ok)
          queued.push({ requestId: result.requestId, title: result.title });
        else {
          failures += 1;
          failureMessages.push(result.error);
        }
      }
    }

    automationProgress.queueReady(queued.length, failures);

    const completionResults = await Promise.all(
      queued.map(({ requestId, title }) => waitForProduct(requestId, title)),
    );
    for (const result of completionResults) {
      if (result.ok) successes += 1;
      else {
        failures += 1;
        failureMessages.push(result.error);
      }
    }

    selectedProductsList.forEach((product) =>
      invalidateProductDetails(product.sku, product.title),
    );
    await load(true);

    setAutomationRunning(false);

    if (!failures) {
      setSelectedProducts({});
      const message = `${successes} ${
        successes === 1 ? "produto processado" : "produtos processados"
      } pela automação em lotes de até 5.`;
      setAutomationMessage({
        tone: "success",
        text: message,
      });
      addNotification("success", message);
    } else {
      const message = `Automação concluída para ${successes}; ${failures} ${
        failures === 1 ? "produto falhou" : "produtos falharam"
      }. ${failureMessages.join(" ")}`;
      setAutomationMessage({
        tone: "error",
        text: message,
      });
      addNotification("error", message);
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
      const response = await fetch("/api/shopify/product-bulk", {
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
      const message =
        result.message ||
        `${count} ${plural} ${count === 1 ? "foi atualizado" : "foram atualizados"} no Shopify.`;
      setAutomationMessage({
        tone: "success",
        text: message,
      });
      addNotification("success", message);
      await load();
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Não foi possível concluir a ação.";
      setAutomationMessage({
        tone: "error",
        text: message,
      });
      addNotification("error", message);
    } finally {
      setBulkActionRunning(null);
    }
  };

  const openChannelBulkModal = async (action: ChannelBulkAction) => {
    if (!selectedIds.length || channelsSaving) return;
    setChannelBulkAction(action);
    setSelectedChannelIds([]);
    setChannelSearch("");
    setChannelsError("");
    setChannelsLoading(true);
    try {
      const response = await fetch("/api/shopify/product-bulk", {
        cache: "no-store",
      });
      const result = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          result?.error || "Não foi possível carregar os canais de venda.",
        );
      setSalesChannels(Array.isArray(result?.channels) ? result.channels : []);
    } catch (cause) {
      setChannelsError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar os canais de venda.",
      );
    } finally {
      setChannelsLoading(false);
    }
  };

  const runChannelBulkAction = async () => {
    if (
      !channelBulkAction ||
      !selectedChannelIds.length ||
      channelsSaving ||
      !selectedProductsList.length
    )
      return;
    setChannelsSaving(true);
    setChannelsError("");
    try {
      const response = await fetch("/api/shopify/product-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action:
            channelBulkAction === "publish"
              ? "publish_channels"
              : "unpublish_channels",
          publicationIds: selectedChannelIds,
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
      setChannelBulkAction(null);
      setSelectedProducts({});
      setAutomationMessage({ tone: "success", text: result.message });
      addNotification("success", result.message);
      await load();
    } catch (cause) {
      setChannelsError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível concluir a ação.",
      );
    } finally {
      setChannelsSaving(false);
    }
  };

  const visibleSalesChannels = salesChannels.filter((channel) =>
    channel.name
      .toLocaleLowerCase("pt-BR")
      .includes(channelSearch.toLocaleLowerCase("pt-BR")),
  );
  const allVisibleChannelsSelected =
    visibleSalesChannels.length > 0 &&
    visibleSalesChannels.every((channel) =>
      selectedChannelIds.includes(channel.id),
    );

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
            setMissingSkus([]);
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
              placeholder="Pesquisar"
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
                  <img src="/icons/n8n.png" alt="" />
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
            <label className="catalog-sort-select">
              <span>Ordenar por</span>
              <select
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value === "title" ? "title" : "updated");
                  setPage(1);
                }}
              >
                <option value="updated">Mais recentes</option>
                <option value="title">A–Z</option>
              </select>
            </label>
            <NotificationCenter
              notifications={notifications}
              open={notificationsOpen}
              onOpenChange={setNotificationsOpen}
              onClear={() => setNotifications([])}
              onRemove={(id) =>
                setNotifications((current) =>
                  current.filter((notification) => notification.id !== id),
                )
              }
            />
            <button
              className="catalog-reset-sort"
              type="button"
              onClick={() => void load(true, true)}
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
                  onClick={() => void openChannelBulkModal("publish")}
                >
                  <Store size={15} />
                  Incluir nos canais de vendas
                </button>
                <button
                  type="button"
                  disabled={!selectedIds.length || Boolean(bulkActionRunning)}
                  onClick={() => void openChannelBulkModal("unpublish")}
                >
                  <EyeOff size={15} />
                  Excluir dos canais de vendas
                </button>
                <hr />
                <button
                  type="button"
                  disabled={!selectedIds.length || Boolean(bulkActionRunning)}
                  onClick={() => runBulkAction("unpublish")}
                ></button>
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
                  <th className="catalog-row-number-column" scope="col">
                    #
                  </th>
                  <th className="catalog-selection-column">
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
                  <th>Produto</th>
                  <th>Status Shopify</th>
                  <th>Status WinThor</th>
                  <th>Estoque</th>
                  <th>SKU</th>
                  <th>Tipo de produto</th>
                  <th>Fabricante</th>
                  <th className="catalog-sales-channels-column">
                    Canais de venda
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.products.map((product, index) => (
                  <tr
                    className={[
                      selectedIds.includes(product.shopifyId)
                        ? "is-selected"
                        : "",
                      activeProductKey ===
                      productRowKey(productHistoryRow(product))
                        ? "is-product-open"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={product.shopifyId}
                    tabIndex={0}
                    role="button"
                    aria-current={
                      activeProductKey ===
                      productRowKey(productHistoryRow(product))
                        ? "true"
                        : undefined
                    }
                    onClick={() => openProductDetails(product)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openProductDetails(product);
                      }
                    }}
                  >
                    <td className="catalog-row-number-column">
                      {(data.page - 1) * data.perPage + index + 1}
                    </td>
                    <td
                      className="catalog-selection-column"
                      onClick={(event) => event.stopPropagation()}
                    >
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
                    <td className="catalog-sales-channels-column">
                      {product.salesChannelsCount ?? "—"}
                    </td>
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
      <SkuNotFoundModal
        skus={visibleMissingSkus}
        onClose={() => setMissingSkus([])}
      />
      {channelBulkAction && (
        <div
          className="sales-channel-bulk-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sales-channel-bulk-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !channelsSaving)
              setChannelBulkAction(null);
          }}
        >
          <section className="sales-channel-bulk-modal">
            <header>
              <h2 id="sales-channel-bulk-title">
                {channelBulkAction === "publish" ? "Incluir" : "Excluir"}{" "}
                {selectedIds.length}{" "}
                {selectedIds.length === 1 ? "produto" : "produtos"} nos canais
                de vendas
              </h2>
              <button
                type="button"
                disabled={channelsSaving}
                onClick={() => setChannelBulkAction(null)}
                aria-label="Fechar"
              >
                <X size={19} />
              </button>
            </header>
            <label className="sales-channel-bulk-search">
              <Search size={17} />
              <input
                value={channelSearch}
                onChange={(event) => setChannelSearch(event.target.value)}
                placeholder="Pesquisar"
                autoFocus
              />
            </label>
            {channelsError && (
              <p className="sales-channel-bulk-error">{channelsError}</p>
            )}
            {channelsLoading ? (
              <div className="sales-channel-bulk-loading">
                <LoaderCircle className="spin" size={22} />
                Carregando canais...
              </div>
            ) : (
              <div className="sales-channel-bulk-list">
                <label className="is-all">
                  <input
                    type="checkbox"
                    checked={allVisibleChannelsSelected}
                    onChange={() =>
                      setSelectedChannelIds((current) => {
                        const visibleIds = visibleSalesChannels.map(
                          (channel) => channel.id,
                        );
                        return allVisibleChannelsSelected
                          ? current.filter((id) => !visibleIds.includes(id))
                          : [...new Set([...current, ...visibleIds])];
                      })
                    }
                  />
                  <span>Canal de vendas</span>
                </label>
                {visibleSalesChannels.map((channel) => (
                  <label key={channel.id}>
                    <input
                      type="checkbox"
                      checked={selectedChannelIds.includes(channel.id)}
                      onChange={() =>
                        setSelectedChannelIds((current) =>
                          current.includes(channel.id)
                            ? current.filter((id) => id !== channel.id)
                            : [...current, channel.id],
                        )
                      }
                    />
                    <Store size={17} />
                    <span>{channel.name}</span>
                  </label>
                ))}
              </div>
            )}
            <footer>
              <button
                className="btn"
                type="button"
                disabled={channelsSaving}
                onClick={() => setChannelBulkAction(null)}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={
                  channelsLoading ||
                  channelsSaving ||
                  !selectedChannelIds.length
                }
                onClick={() => void runChannelBulkAction()}
              >
                {channelsSaving && <LoaderCircle className="spin" size={15} />}
                {channelsSaving
                  ? "Salvando..."
                  : channelBulkAction === "publish"
                    ? "Incluir produtos"
                    : "Excluir produtos"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
