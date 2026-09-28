import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getExcludedProductRowsWithStatus } from "@/lib/googleSheets";

export async function GET(request: NextRequest) {
  if (!await getCurrentUser()) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  try {
    const sheet = await getExcludedProductRowsWithStatus(request.nextUrl.searchParams.get("refresh") === "1");
    return NextResponse.json({
      rows: sheet.rows,
      source: { status: "connected", lastSyncedAt: sheet.lastSyncedAt, sheetName: sheet.sheetName, totalRows: sheet.rows.length },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao carregar produtos excluídos." }, { status: 500 });
  }
}
