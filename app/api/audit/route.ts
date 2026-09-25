import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, recordAudit } from "@/lib/auth";

const allowedActions = new Set(["report_exported"]);

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const action = String(body?.action || "");
  if (!allowedActions.has(action)) return NextResponse.json({ error: "Evento inválido." }, { status: 400 });
  await recordAudit({ userId: user.id, action, entity: "report", details: typeof body?.details === "object" ? body.details : null });
  return NextResponse.json({ ok: true });
}
