import { NextRequest, NextResponse } from "next/server";
import {
  getAppSettings,
  getCurrentUser,
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
    const dashboard = buildDashboard(rows, {
      q: (params.get("q") || "").slice(0, 120),
      marca: (params.get("marca") || "").slice(0, 120),
      status: (params.get("status") || "").slice(0, 40),
      days,
      month: (params.get("month") || "").slice(0, 7),
      compareMonth: (params.get("compareMonth") || "").slice(0, 7),
      quality: (params.get("quality") || "").slice(0, 40),
      catalog: catalogOnly,
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
