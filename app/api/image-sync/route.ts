import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import {
  claimImageSyncJobs,
  completeImageSyncJob,
  recordAudit,
} from "@/lib/auth";

function authorized(request: NextRequest) {
  const expected = String(process.env.IMAGE_SYNC_AGENT_TOKEN || "").trim();
  const received = String(request.headers.get("authorization") || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!expected || !received) return false;
  const expectedHash = createHash("sha256").update(expected).digest();
  const receivedHash = createHash("sha256").update(received).digest();
  return timingSafeEqual(expectedHash, receivedHash);
}

export async function GET(request: NextRequest) {
  if (!process.env.IMAGE_SYNC_AGENT_TOKEN)
    return NextResponse.json(
      { error: "IMAGE_SYNC_AGENT_TOKEN não configurado." },
      { status: 503 },
    );
  if (!authorized(request))
    return NextResponse.json({ error: "Token inválido." }, { status: 401 });

  const limit = Number(request.nextUrl.searchParams.get("limit") || 5);
  const jobs = await claimImageSyncJobs(limit);
  return NextResponse.json(
    { ok: true, jobs },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  if (!process.env.IMAGE_SYNC_AGENT_TOKEN)
    return NextResponse.json(
      { error: "IMAGE_SYNC_AGENT_TOKEN não configurado." },
      { status: 503 },
    );
  if (!authorized(request))
    return NextResponse.json({ error: "Token inválido." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const results = Array.isArray(body?.results) ? body.results.slice(0, 20) : [];
  if (!results.length)
    return NextResponse.json(
      { error: "Nenhum resultado recebido." },
      { status: 400 },
    );

  for (const result of results) {
    const id = Number(result?.id);
    if (!Number.isSafeInteger(id) || id <= 0) continue;
    await completeImageSyncJob(
      id,
      result?.success === true,
      String(result?.error || ""),
    );
  }
  await recordAudit({
    action: "image_sync_agent_acknowledged",
    entity: "image_sync",
    details: {
      total: results.length,
      successes: results.filter((item: any) => item?.success === true).length,
    },
  });
  return NextResponse.json({ ok: true });
}
