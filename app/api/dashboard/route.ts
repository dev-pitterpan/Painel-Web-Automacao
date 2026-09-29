import { NextRequest, NextResponse } from "next/server";
import {
  getAppSettings,
  getCurrentUser,
  getProductOverrides,
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
    const [settings, overrides] = await Promise.all([
      getAppSettings(),
      getProductOverrides(),
    ]);
    const rows = sheet.rows.map((row) => {
      const override = overrides.get(row.sku.trim());
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
      catalog: params.get("catalog") === "1",
      timeSettings: settings,
    });
    return NextResponse.json({
      ...dashboard,
      permissions: {
        canReprocess: user.role === "admin",
        canEditProducts: user.role === "admin",
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
