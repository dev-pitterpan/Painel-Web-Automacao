import { NextRequest, NextResponse } from "next/server";
import {
  getAppSettings,
  getCurrentUser,
  isSuccessfulReprocessResult,
  listLatestProcessingResults,
  getProductOverrides,
  getShopifyCatalogProductsBySkus,
  productIdentityKey,
} from "@/lib/auth";
import { getHistoryRowsWithStatus } from "@/lib/googleSheets";
import {
  buildDashboard,
  calculateCatalogQuality,
  latestHistoryRowsByProduct,
} from "@/lib/metrics";

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
    const historicalView = params.get("historicalView") === "1";
    const sheet = await getHistoryRowsWithStatus(params.get("refresh") === "1");
    const [settings, overrides, catalogBySku] = await Promise.all([
      getAppSettings(),
      historicalView ? Promise.resolve(new Map()) : getProductOverrides(),
      historicalView
        ? Promise.resolve(new Map())
        : getShopifyCatalogProductsBySkus(sheet.rows.map((row) => row.sku)),
    ]);
    const catalogOnly = params.get("catalog") === "1";
    const rows = sheet.rows
      .filter(
        (row) =>
          !catalogOnly ||
          row.status === "Sucesso - ChatGPT" ||
          catalogBySku.has(String(row.sku || "").trim()),
      )
      .map((row) => {
        // Relatórios históricos precisam preservar exatamente o produto
        // registrado na execução. Um SKU pode pertencer a unidade, display
        // ou variações diferentes e não identifica sozinho um item Shopify.
        if (historicalView) return row;
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
    const includeCodex = !historicalView && params.get("includeCodex") !== "0";
    const dashboardRows = [...rows];
    const errorRows = [...rows];
    {
      const latestReprocesses = await listLatestProcessingResults();
      const latestSheetRowBySku = new Map<string, (typeof rows)[number]>();
      const sheetCodexResults = new Set(
        rows
          .filter((row) => row.status === "Sucesso - ChatGPT")
          .map((row) => [row.sku, row.dataHora, row.tituloDepois].join("|")),
      );
      latestHistoryRowsByProduct(rows).forEach((row) => {
        const sku = String(row.sku || "")
          .trim()
          .toLocaleLowerCase("pt-BR");
        if (sku) latestSheetRowBySku.set(sku, row);
      });

      latestReprocesses.forEach((record) => {
        const sku = String(record.sku || "").trim();
        const base = latestSheetRowBySku.get(sku.toLocaleLowerCase("pt-BR"));
        const rawResult = Array.isArray(record.result)
          ? record.result[0]
          : record.result;
        const result =
          rawResult && typeof rawResult === "object" ? rawResult : {};

        if (
          result.origem === "ChatGPT" &&
          sheetCodexResults.has(
            [
              sku,
              String(result.data_hora || record.createdAt),
              String(result.titulo_depois || record.title || ""),
            ].join("|"),
          )
        )
          return;
        const isYes = (value: unknown) =>
          ["sim", "true"].includes(String(value || "").toLowerCase());
        const reprocessSucceeded = isSuccessfulReprocessResult(record.result);
        const historyRow = {
          dataHora: String(result.data_hora || record.createdAt),
          sku,
          shopifyId: String(result.shopify_id || base?.shopifyId || ""),
          marca: String(result.marca || base?.marca || ""),
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
          status: reprocessSucceeded
            ? result.origem === "ChatGPT"
              ? "Sucesso - ChatGPT"
              : "Sucesso - reprocessado"
            : String(result.status || "Erro - reprocessamento não concluído"),
        };
        errorRows.push(historyRow);
        if (includeReprocess || (includeCodex && result.origem === "ChatGPT"))
          dashboardRows.push(historyRow);
      });
    }
    const dashboardOptions = {
      q: (params.get("q") || "").slice(0, 2000),
      marca: (params.get("marca") || "").slice(0, 120),
      status: (params.get("status") || "").slice(0, 40),
      days,
      month: (params.get("month") || "").slice(0, 7),
      compareMonth: (params.get("compareMonth") || "").slice(0, 7),
      quality: (params.get("quality") || "").slice(0, 40),
      catalog: catalogOnly,
      latestPerProduct: params.get("latest") === "1",
      timeSettings: settings,
    };
    const currentCatalogRows = latestHistoryRowsByProduct(
      dashboardRows,
    ).flatMap((row) => {
      const catalogProduct = catalogBySku.get(String(row.sku || "").trim());
      if (!catalogProduct) return [];
      return [
        {
          ...row,
          shopifyId: catalogProduct.shopifyId,
          tituloDepois: catalogProduct.title || row.tituloDepois,
          tagsDepois: catalogProduct.tags.join(", "),
          colecoesDepois: catalogProduct.collections.join(", "),
          marca: catalogProduct.vendor || row.marca,
          tipoProduto: catalogProduct.productType,
        },
      ];
    });
    const dashboard = buildDashboard(
      dashboardOptions.quality
        ? currentCatalogRows
        : includeReprocess || includeCodex
          ? dashboardRows
          : rows,
      dashboardOptions.quality
        ? { ...dashboardOptions, latestPerProduct: true }
        : dashboardOptions,
    );
    const currentErrors = buildDashboard(errorRows, {
      ...dashboardOptions,
      q: "",
      marca: "",
      days: 30,
      month: "",
      compareMonth: "",
      catalog: false,
      quality: "",
      status: "erro",
      latestPerProduct: true,
    }).metrics.erros;
    const qualityRows = buildDashboard(currentCatalogRows, {
      ...dashboardOptions,
      catalog: true,
      month: "all",
      compareMonth: "",
      quality: "",
      status: "",
      latestPerProduct: true,
    }).rows;
    const catalogQuality = calculateCatalogQuality(qualityRows);
    return NextResponse.json({
      ...dashboard,
      catalogQuality,
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
        totalErrors: currentErrors,
        currentErrors,
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
