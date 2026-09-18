import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getHistoryRows } from "@/lib/googleSheets";
import { buildDashboard } from "@/lib/metrics";

export async function GET(req: NextRequest) {
	if (!await getCurrentUser()) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
	try {
		const params = req.nextUrl.searchParams;
		const requestedDays = Number(params.get("days") || 30);
		const days = Number.isFinite(requestedDays) ? Math.min(Math.max(Math.floor(requestedDays), 1), 3650) : 30;
		const rows = await getHistoryRows(params.get("refresh") === "1");
		return NextResponse.json(buildDashboard(rows, {
			q: (params.get("q") || "").slice(0, 120),
			marca: (params.get("marca") || "").slice(0, 120),
			status: (params.get("status") || "").slice(0, 40),
			days
		}));
	} catch (error) {
		return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao carregar dashboard." }, { status: 500 });
	}
}
