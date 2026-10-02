"use client";

type CachedDetails = {
  product: Record<string, unknown>;
  cachedAt: number;
};

const detailsCache = new Map<string, CachedDetails>();
const pendingDetails = new Map<string, Promise<Record<string, unknown>>>();
const CACHE_TTL_MS = 10 * 60 * 1000;

function detailsKey(sku: string, title: string) {
  return `${sku.trim()}::${title.trim().toLocaleLowerCase("pt-BR")}`;
}

export async function loadProductDetails(
  sku: string,
  title: string,
  force = false,
) {
  const key = detailsKey(sku, title);
  const cached = detailsCache.get(key);
  if (!force && cached && Date.now() - cached.cachedAt < CACHE_TTL_MS)
    return cached.product;
  const pending = pendingDetails.get(key);
  if (!force && pending) return pending;

  const request = fetch(
    `/api/shopify-products?details=1&sku=${encodeURIComponent(sku)}&title=${encodeURIComponent(title)}`,
    { cache: "no-store" },
  )
    .then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(body.error || "Não foi possível carregar o produto.");
      const product = (body.product || {}) as Record<string, unknown>;
      detailsCache.set(key, { product, cachedAt: Date.now() });
      return product;
    })
    .finally(() => pendingDetails.delete(key));

  pendingDetails.set(key, request);
  return request;
}

export function invalidateProductDetails(sku: string, title: string) {
  detailsCache.delete(detailsKey(sku, title));
}
