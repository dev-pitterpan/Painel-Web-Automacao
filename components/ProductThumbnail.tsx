"use client";

import { ImageIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type ImageState = { url: string; alt: string } | null;

const imageCache = new Map<string, ImageState>();
const pendingRequests = new Map<string, Promise<ImageState>>();

async function loadImage(sku: string): Promise<ImageState> {
  if (imageCache.has(sku)) return imageCache.get(sku) ?? null;
  const pending = pendingRequests.get(sku);
  if (pending) return pending;

  const request = fetch(
    `/api/n8n/product-image?sku=${encodeURIComponent(sku)}`,
    {
      cache: "force-cache",
    },
  )
    .then(async (response) => {
      if (!response.ok) return null;
      const body = await response.json().catch(() => ({}));
      return body?.image?.url
        ? { url: String(body.image.url), alt: String(body.image.alt || "") }
        : null;
    })
    .catch(() => null)
    .then((image) => {
      imageCache.set(sku, image);
      pendingRequests.delete(sku);
      return image;
    });

  pendingRequests.set(sku, request);
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
  const [image, setImage] = useState<ImageState>(
    () => imageCache.get(String(sku || "").trim()) ?? null,
  );
  const [loaded, setLoaded] = useState(() =>
    imageCache.has(String(sku || "").trim()),
  );

  useEffect(() => {
    const normalizedSku = String(sku || "").trim();
    setImage(imageCache.get(normalizedSku) ?? null);
    setLoaded(imageCache.has(normalizedSku));
    if (!normalizedSku) {
      setLoaded(true);
      return;
    }

    const element = containerRef.current;
    if (!element) return;
    let cancelled = false;
    const fetchVisibleImage = () => {
      void loadImage(normalizedSku).then((nextImage) => {
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
  }, [sku]);

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
