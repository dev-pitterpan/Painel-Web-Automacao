import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  syncWinthorManufacturerCodes,
  syncWinthorProductStatuses,
} from "@/lib/auth";

function normalizeToken(value: unknown) {
  let token = String(value || "")
    .trim()
    .replace(/^WINTHOR_SYNC_TOKEN\s*=\s*/i, "")
    .trim();
  if (
    token.length >= 2 &&
    ((token.startsWith('"') && token.endsWith('"')) ||
      (token.startsWith("'") && token.endsWith("'")))
  ) {
    token = token.slice(1, -1).trim();
  }
  return token;
}

function validToken(req: NextRequest) {
  const expected = normalizeToken(process.env.WINTHOR_SYNC_TOKEN);
  const received = normalizeToken(req.headers.get("x-pitterpan-token"));
  if (!expected || !received) return false;
  const left = createHash("sha256").update(expected).digest();
  const right = createHash("sha256").update(received).digest();
  return timingSafeEqual(left, right);
}

export async function POST(req: NextRequest) {
  if (!validToken(req))
    return NextResponse.json({ error: "Token inválido." }, { status: 401 });

  try {
    const body = await req.json();
    const products = body?.products;
    const outOfLine = body?.outOfLine;
    if (
      !Array.isArray(products) ||
      products.length < 10_000 ||
      products.length > 50_000 ||
      !Array.isArray(outOfLine) ||
      outOfLine.length < 100 ||
      outOfLine.length > products.length
    ) {
      return NextResponse.json(
        { error: "Lote Oracle incompleto ou inválido." },
        { status: 400 },
      );
    }
    const manufacturerCodes = products.map(
      (product: Record<string, unknown>) => ({
        sku: String(product?.sku ?? "").trim(),
        manufacturerCode: String(product?.manufacturerCode ?? "").trim(),
      }),
    );
    const statuses = outOfLine.map((product: Record<string, unknown>) => ({
      sku: String(product?.sku ?? "").trim(),
      description: String(product?.description ?? "").trim(),
    }));
    if (
      manufacturerCodes.some((product: { sku: string }) => !product.sku) ||
      statuses.some((product: { sku: string }) => !product.sku)
    ) {
      return NextResponse.json(
        { error: "Lote Oracle contém produtos sem código." },
        { status: 400 },
      );
    }
    const manufacturer = await syncWinthorManufacturerCodes(manufacturerCodes);
    const status = await syncWinthorProductStatuses(statuses, "oracle:WINTL");
    return NextResponse.json({ ok: true, manufacturer, status });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha na sincronização Oracle.",
      },
      { status: 500 },
    );
  }
}
