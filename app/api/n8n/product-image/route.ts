import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

const DEFAULT_WEBHOOK =
  "https://n8n.pitterpan.com.br/webhook/dashboard-editar-produto";
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<
  string,
  { expiresAt: number; image: { url: string; alt: string } | null }
>();

function clean(value: unknown, max = 1000) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const sku = clean(request.nextUrl.searchParams.get("sku"), 120);
  if (!sku) return NextResponse.json({ image: null });

  const cached = cache.get(sku);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(
      { image: cached.image },
      { headers: { "Cache-Control": "private, max-age=600" } },
    );
  }

  const token = clean(
    process.env.N8N_PRODUCT_EDITOR_TOKEN || process.env.N8N_REPROCESS_TOKEN,
  );
  const webhook = clean(
    process.env.N8N_PRODUCT_EDITOR_WEBHOOK_URL || DEFAULT_WEBHOOK,
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "x-pitterpan-token": token } : {}),
      },
      body: JSON.stringify({
        action: "lookup",
        sku,
        origem: "dashboard-imagem",
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json().catch(() => ({}));
    const product = result?.product || result?.data || result;
    const images = Array.isArray(product?.images)
      ? product.images
      : Array.isArray(product?.media)
        ? product.media
        : [];
    const first = images.find((item: any) =>
      Boolean(item?.url || item?.src || item?.image?.url),
    );
    const image = first
      ? {
          url: clean(first.url || first.src || first.image?.url, 3000),
          alt: clean(first.alt || first.altText, 500),
        }
      : null;
    cache.set(sku, { image, expiresAt: Date.now() + CACHE_TTL_MS });
    return NextResponse.json(
      { image },
      { headers: { "Cache-Control": "private, max-age=600" } },
    );
  } catch {
    cache.set(sku, { image: null, expiresAt: Date.now() + 60_000 });
    return NextResponse.json(
      { image: null },
      { headers: { "Cache-Control": "private, max-age=60" } },
    );
  } finally {
    clearTimeout(timeout);
  }
}
