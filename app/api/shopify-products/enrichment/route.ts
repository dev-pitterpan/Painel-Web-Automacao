import { NextRequest, NextResponse } from "next/server";
import {
  getCurrentUser,
  listLatestProductAutomationResultsBySkus,
} from "@/lib/auth";
import { getHistoryRowsWithStatus } from "@/lib/googleSheets";
import { latestHistoryRowsByProduct, parseHistoryDate } from "@/lib/metrics";
import { getShopifyProductSalesChannelCounts } from "@/lib/shopify-admin";
import type { HistoryRow } from "@/lib/types";

function normalized(value: unknown, max = 180) {
  return String(value || "")
    .trim()
    .slice(0, max);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  try {
    const body = await request.json();
    const products: Array<{ shopifyId: string; sku: string; title: string }> = (
      Array.isArray(body?.products) ? (body.products as unknown[]) : []
    )
      .slice(0, 250)
      .map((product: unknown) => {
        const record =
          product && typeof product === "object"
            ? (product as Record<string, unknown>)
            : {};
        return {
          shopifyId: normalized(record.shopifyId),
          sku: normalized(record.sku, 160),
          title: normalized(record.title, 500),
        };
      })
      .filter((product) => product.shopifyId || product.sku);

    const visibleSkus = new Set(
      products
        .map((product) => product.sku.toLocaleLowerCase("pt-BR"))
        .filter(Boolean),
    );
    const [salesChannelCounts, history, productAutomationResults] =
      await Promise.all([
        getShopifyProductSalesChannelCounts(
          products.map((product) => product.shopifyId),
        ).catch(() => new Map<string, number>()),
        getHistoryRowsWithStatus().catch(() => ({
          rows: [] as HistoryRow[],
          lastSyncedAt: "",
          sheetName: "",
        })),
        listLatestProductAutomationResultsBySkus(
          products.map((product) => product.sku),
        ).catch(() => []),
      ]);

    const latestBySku = new Map<string, HistoryRow>(
      latestHistoryRowsByProduct(history.rows)
        .filter((row) =>
          visibleSkus.has(row.sku.trim().toLocaleLowerCase("pt-BR")),
        )
        .map((row) => [row.sku.trim().toLocaleLowerCase("pt-BR"), row]),
    );

    productAutomationResults.forEach((record) => {
      const sku = record.sku.trim().toLocaleLowerCase("pt-BR");
      if (!visibleSkus.has(sku)) return;
      const current = latestBySku.get(sku);
      const currentTime = current
        ? (parseHistoryDate(current.dataHora)?.getTime() ?? 0)
        : 0;
      const resultTime = new Date(record.createdAt).getTime();
      if (Number.isFinite(resultTime) && resultTime < currentTime) return;
      const rawResult = Array.isArray(record.result)
        ? record.result[0]
        : record.result;
      const result =
        rawResult && typeof rawResult === "object"
          ? (rawResult as Record<string, unknown>)
          : {};
      const isYes = (value: unknown) =>
        ["sim", "true"].includes(String(value || "").toLowerCase());
      latestBySku.set(sku, {
        dataHora: String(result.data_hora || record.createdAt),
        sku: record.sku,
        marca: String(result.marca || current?.marca || ""),
        tituloAntes: String(
          result.titulo_antes || current?.tituloAntes || record.title,
        ),
        tituloDepois: String(result.titulo_depois || record.title),
        tagsAntes: String(result.tags_antes || current?.tagsAntes || ""),
        tagsDepois: String(result.tags_depois || current?.tagsDepois || ""),
        colecoesAntes: String(
          result.colecoes_antes || current?.colecoesAntes || "",
        ),
        colecoesDepois: String(
          result.colecoes_depois || current?.colecoesDepois || "",
        ),
        tituloAlterado: isYes(result.titulo_alterado),
        tagsAlteradas: isYes(result.tags_alteradas),
        colecoesAlteradas: isYes(result.colecoes_alteradas),
        descricaoGerada: isYes(result.descricao_gerada),
        status: String(result.status || "Sucesso"),
      });
    });

    return NextResponse.json({
      salesChannelCounts: Object.fromEntries(salesChannelCounts),
      processingHistoryBySku: Object.fromEntries(latestBySku),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao complementar os produtos.",
      },
      { status: 500 },
    );
  }
}
