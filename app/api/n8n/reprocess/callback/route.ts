import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { completeReprocess, isCompleteReprocessResult } from "@/lib/auth";

function hasValidToken(request: NextRequest) {
  const expected = String(process.env.N8N_REPROCESS_CALLBACK_TOKEN || process.env.N8N_REPROCESS_TOKEN || "").trim();
  const received = String(request.headers.get("x-pitterpan-token") || "").trim();
  if (!expected || !received) return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

export async function POST(request: NextRequest) {
  if (!hasValidToken(request)) return NextResponse.json({ error: "Callback não autorizado." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const requestId = String(body?.request_id || body?.requestId || "").trim();
  const result = body?.resultado ?? body?.result ?? body?.data ?? body;

  if (!requestId) return NextResponse.json({ error: "request_id obrigatório." }, { status: 400 });
  if (!isCompleteReprocessResult(result)) return NextResponse.json({ error: "Resultado ainda não concluído.", completed: false }, { status: 202 });
  if (!completeReprocess(requestId, result)) return NextResponse.json({ error: "Reprocessamento pendente não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true, completed: true, requestId });
}