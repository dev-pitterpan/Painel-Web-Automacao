import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getReprocessStatus } from "@/lib/auth";

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
      { error: "Reprocessamento não encontrado." },
      { status: 404 },
    );

  return NextResponse.json(
    { ok: true, ...status },
    { headers: { "Cache-Control": "no-store" } },
  );
}
