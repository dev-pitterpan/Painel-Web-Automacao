import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
	if (!await getCurrentUser()) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
	const url = process.env.N8N_REPROCESS_WEBHOOK_URL;
	if (!url) return NextResponse.json({ error: "Webhook n8n ainda não configurado." }, { status: 503 });
	const body = await req.json().catch(() => null);
	const payload = {
		sku: String(body?.sku || "").trim().slice(0, 120),
		titulo: String(body?.titulo || "").trim().slice(0, 500),
		origem: "dashboard-pitter-pan"
	};
	if (!payload.sku) return NextResponse.json({ error: "SKU obrigatório." }, { status: 400 });
	const headers: Record<string, string> = { "Content-Type": "application/json" };
	if (process.env.N8N_REPROCESS_TOKEN) headers["x-pitterpan-token"] = process.env.N8N_REPROCESS_TOKEN;
	const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload), cache: "no-store" });
	return NextResponse.json({ ok: response.ok, status: response.status, response: (await response.text()).slice(0, 2000) }, { status: response.ok ? 200 : 502 });
}
