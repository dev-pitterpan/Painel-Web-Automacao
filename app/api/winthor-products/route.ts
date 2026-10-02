import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  getCurrentUser,
  getWinthorProductStatus,
  syncWinthorProductStatuses,
  type WinthorStatusProduct,
} from "@/lib/auth";

function isValidSyncToken(req: NextRequest) {
  const expectedTokens = [
    process.env.WINTHOR_SYNC_TOKEN,
    process.env.N8N_REPROCESS_TOKEN,
  ]
    .map((token) => String(token || "").trim())
    .filter(Boolean);
  const received = String(
    req.headers.get("x-pitterpan-token") ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
      "",
  ).trim();
  if (!expectedTokens.length || !received) return false;
  const receivedHash = createHash("sha256").update(received).digest();
  let valid = false;
  for (const expected of expectedTokens) {
    const expectedHash = createHash("sha256").update(expected).digest();
    if (timingSafeEqual(expectedHash, receivedHash)) valid = true;
  }
  return valid;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const sku = String(req.nextUrl.searchParams.get("sku") || "").trim();
  if (!sku)
    return NextResponse.json({ error: "SKU obrigatório." }, { status: 400 });
  try {
    return NextResponse.json(await getWinthorProductStatus(sku));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao consultar o status WinThor.",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  if (!isValidSyncToken(req))
    return NextResponse.json(
      { error: "Token de sincronização inválido." },
      { status: 401 },
    );
  try {
    const body = await req.json();
    if (!Array.isArray(body?.products) || body.products.length > 50_000)
      return NextResponse.json(
        { error: "Envie uma lista com até 50.000 produtos." },
        { status: 400 },
      );
    const products: WinthorStatusProduct[] = body.products.map(
      (product: Record<string, unknown>) => ({
        sku: String(product?.sku ?? product?.codigo ?? "").trim(),
        description: String(
          product?.description ?? product?.descricao ?? "",
        ).trim(),
      }),
    );
    const result = await syncWinthorProductStatuses(
      products,
      String(body?.sourceFile || "produtos_fora_de_linha.xls"),
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao sincronizar os produtos do WinThor.",
      },
      { status: 500 },
    );
  }
}
