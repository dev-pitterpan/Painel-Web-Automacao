import { NextRequest, NextResponse } from "next/server";
import {
  getCurrentUser,
  getProductAutomationStatuses,
  getReprocessStatus,
} from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const requestId = String(
    request.nextUrl.searchParams.get("request_id") || "",
  ).trim();
  if (!requestId)
    return NextResponse.json(
      { error: "request_id obrigatório." },
      { status: 400 },
    );

  const status = await getReprocessStatus(user, requestId);
  if (!status)
    return NextResponse.json(
      { error: "Processamento não encontrado." },
      { status: 404 },
    );

  return NextResponse.json(
    { ok: true, ...status },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (
    !Array.isArray(body?.requestIds) ||
    !body.requestIds.length ||
    body.requestIds.length > 1000 ||
    !body.requestIds.every(
      (id: unknown) => typeof id === "string" && id.length <= 100,
    )
  )
    return NextResponse.json(
      { error: "Envie de 1 a 1000 identificadores válidos." },
      { status: 400 },
    );

  const statuses = await getProductAutomationStatuses(user, body.requestIds);
  return NextResponse.json(
    { ok: true, statuses },
    { headers: { "Cache-Control": "no-store" } },
  );
}
