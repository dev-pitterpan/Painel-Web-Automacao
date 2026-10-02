"use client";

import { ImageIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type CachedProductImage = { url: string; alt: string };
type ImageState = CachedProductImage | null;

const imageCache = new Map<string, ImageState>();
const pendingRequests = new Map<string, Promise<ImageState>>();

function imageKey(sku: string, title = "") {
  return `${String(sku || "").trim()}::${String(title || "")
    .trim()
    .toLocaleLowerCase("pt-BR")}`;
}

export function getCachedProductImage(
  sku: string,
  title = "",
): ImageState | undefined {
  return imageCache.get(imageKey(sku, title));
}

export function setCachedProductImage(
  sku: string,
  image: ImageState,
  title = "",
) {
  const normalizedSku = String(sku || "").trim();
  if (!normalizedSku) return;
  const key = imageKey(normalizedSku, title);
  imageCache.set(key, image);
  window.dispatchEvent(
    new CustomEvent("product-image-cache-updated", {
      detail: { key, image },
    }),
  );
}

async function loadImage(sku: string, title: string): Promise<ImageState> {
  const key = imageKey(sku, title);
  if (imageCache.has(key)) return imageCache.get(key) ?? null;
  const pending = pendingRequests.get(key);
  if (pending) return pending;

  const request = fetch(
    `/api/shopify-products?details=1&compact=1&sku=${encodeURIComponent(sku)}&title=${encodeURIComponent(title)}`,
    {
      cache: "force-cache",
    },
  )
    .then(async (response) => {
      if (!response.ok) return null;
      const body = await response.json().catch(() => ({}));
      const image = Array.isArray(body?.product?.images)
        ? body.product.images[0]
        : null;
      return image?.url
        ? { url: String(image.url), alt: String(image.alt || "") }
        : null;
    })
    .catch(() => null)
    .then((image) => {
      setCachedProductImage(sku, image, title);
      pendingRequests.delete(key);
      return image;
    });

  pendingRequests.set(key, request);
  return request;
}

export function ProductThumbnail({
  sku,
  title = "",
}: {
  sku: string;
  title?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const key = imageKey(sku, title);
  const [image, setImage] = useState<ImageState>(
    () => imageCache.get(key) ?? null,
  );
  const [loaded, setLoaded] = useState(() => imageCache.has(key));

  useEffect(() => {
    const normalizedSku = String(sku || "").trim();
    const normalizedKey = imageKey(normalizedSku, title);
    setImage(imageCache.get(normalizedKey) ?? null);
    setLoaded(imageCache.has(normalizedKey));
    if (!normalizedSku) {
      setLoaded(true);
      return;
    }

    const element = containerRef.current;
    if (!element) return;
    let cancelled = false;
    const fetchVisibleImage = () => {
      void loadImage(normalizedSku, title).then((nextImage) => {
        if (cancelled) return;
        setImage(nextImage);
        setLoaded(true);
      });
    };

    if (!("IntersectionObserver" in window)) {
      fetchVisibleImage();
      return () => {
        cancelled = true;
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        fetchVisibleImage();
      },
      { rootMargin: "240px" },
    );
    observer.observe(element);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [sku, title]);

  useEffect(() => {
    const normalizedKey = imageKey(sku, title);
    const updateFromCache = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.key !== normalizedKey) return;
      setImage(detail.image ?? null);
      setLoaded(true);
    };
    window.addEventListener("product-image-cache-updated", updateFromCache);
    return () =>
      window.removeEventListener(
        "product-image-cache-updated",
        updateFromCache,
      );
  }, [sku, title]);

  return (
    <div
      ref={containerRef}
      className={`product-thumbnail ${loaded ? "is-loaded" : "is-loading"}`}
      title={image ? title || image.alt : "Produto sem imagem"}
    >
      {image ? (
        <img
          src={image.url}
          alt={image.alt || title || "Imagem do produto"}
          loading="lazy"
        />
      ) : (
        <span aria-label="Produto sem imagem">
          <ImageIcon size={17} />
        </span>
      )}
    </div>
  );
}
