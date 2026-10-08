import { NextRequest, NextResponse } from "next/server";
import {
  getAppSettings,
  getCurrentUser,
  isSuccessfulReprocessResult,
  listLatestReprocessResults,
  getProductOverrides,
  getShopifyCatalogProductsBySkus,
  productIdentityKey,
} from "@/lib/auth";
import { getHistoryRowsWithStatus } from "@/lib/googleSheets";
import { buildDashboard } from "@/lib/metrics";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  try {
    const params = req.nextUrl.searchParams;
    const requestedDays = Number(params.get("days") || 30);
    const days = Number.isFinite(requestedDays)
      ? Math.min(Math.max(Math.floor(requestedDays), 1), 3650)
      : 30;
    const sheet = await getHistoryRowsWithStatus(params.get("refresh") === "1");
    const [settings, overrides, catalogBySku] = await Promise.all([
      getAppSettings(),
      getProductOverrides(),
      getShopifyCatalogProductsBySkus(sheet.rows.map((row) => row.sku)),
    ]);
    const catalogOnly = params.get("catalog") === "1";
    const rows = sheet.rows
      .filter(
        (row) => !catalogOnly || catalogBySku.has(String(row.sku || "").trim()),
      )
      .map((row) => {
        const catalogProduct = catalogBySku.get(String(row.sku || "").trim());
        const override = overrides.get(
          productIdentityKey(row.sku, row.tituloDepois || row.tituloAntes),
        );
        if (catalogProduct)
          return {
            ...row,
            shopifyId: catalogProduct.shopifyId,
            tituloDepois: catalogProduct.title || row.tituloDepois,
            tagsDepois: catalogProduct.tags.join(", "),
            colecoesDepois: catalogProduct.collections.join(", "),
            marca: catalogProduct.vendor || row.marca,
            tipoProduto: catalogProduct.productType,
          };
        if (!override) return row;
        return {
          ...row,
          tituloDepois: override.title || row.tituloDepois,
          tagsDepois: override.tags.join(", "),
          colecoesDepois: override.collections.join(", "),
        };
      });
    const includeReprocess = params.get("includeReprocess") === "1";
    const dashboardRows = [...rows];
    if (includeReprocess) {
      const latestReprocesses = await listLatestReprocessResults();
      const latestSheetRowBySku = new Map<string, (typeof rows)[number]>();
      rows.forEach((row) => {
        const sku = String(row.sku || "")
          .trim()
          .toLocaleLowerCase("pt-BR");
        if (sku && !latestSheetRowBySku.has(sku))
          latestSheetRowBySku.set(sku, row);
      });

      latestReprocesses.forEach((record) => {
        if (!isSuccessfulReprocessResult(record.result)) return;
        const sku = String(record.sku || "").trim();
        const base = latestSheetRowBySku.get(sku.toLocaleLowerCase("pt-BR"));
        const rawResult = Array.isArray(record.result)
          ? record.result[0]
          : record.result;
        const result =
          rawResult && typeof rawResult === "object" ? rawResult : {};
        const isYes = (value: unknown) =>
          ["sim", "true"].includes(String(value || "").toLowerCase());
        dashboardRows.push({
          dataHora: record.createdAt,
          sku,
          shopifyId: base?.shopifyId,
          marca: base?.marca || "",
          tipoProduto: base?.tipoProduto,
          tituloAntes: String(result.titulo_antes || base?.tituloAntes || ""),
          tituloDepois: String(
            result.titulo_depois || record.title || base?.tituloDepois || "",
          ),
          tagsAntes: String(result.tags_antes || base?.tagsAntes || ""),
          tagsDepois: String(result.tags_depois || base?.tagsDepois || ""),
          colecoesAntes: String(
            result.colecoes_antes || base?.colecoesAntes || "",
          ),
          colecoesDepois: String(
            result.colecoes_depois || base?.colecoesDepois || "",
          ),
          tituloAlterado: isYes(result.titulo_alterado),
          tagsAlteradas: isYes(result.tags_alteradas),
          colecoesAlteradas: isYes(result.colecoes_alteradas),
          descricaoGerada: isYes(result.descricao_gerada),
          status: String(result.status || "Sucesso"),
        });
      });
    }
    const dashboard = buildDashboard(dashboardRows, {
      q: (params.get("q") || "").slice(0, 120),
      marca: (params.get("marca") || "").slice(0, 120),
      status: (params.get("status") || "").slice(0, 40),
      days,
      month: (params.get("month") || "").slice(0, 7),
      compareMonth: (params.get("compareMonth") || "").slice(0, 7),
      quality: (params.get("quality") || "").slice(0, 40),
      catalog: catalogOnly,
      latestPerProduct: params.get("latest") === "1",
      timeSettings: settings,
    });
    return NextResponse.json({
      ...dashboard,
      permissions: {
        canReprocess: user.role === "admin",
        canEditProducts: user.role === "admin",
      },
      timeSettings: {
        manualSecondsPerProduct: settings.manualSecondsPerProduct,
        batchSize: settings.batchSize,
        batchSeconds: settings.batchSeconds,
      },
      source: {
        status: "connected",
        lastSyncedAt: sheet.lastSyncedAt,
        sheetName: sheet.sheetName,
        totalRows: rows.length,
        totalErrors: rows.filter((row) =>
          row.status.toLowerCase().includes("erro"),
        ).length,
        qualityTarget: settings.qualityTarget,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao carregar dashboard.",
      },
      { status: 500 },
    );
  }
}
