import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Client } from "pg";
import { getCurrentUser, listLatestProcessingResults } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const expected = String(process.env.SHOPIFY_CATALOG_SYNC_TOKEN || "").trim();
  const received = String(req.headers.get("x-pitterpan-token") || "").trim();
  const tokenValid = Boolean(expected && received) && timingSafeEqual(
    createHash("sha256").update(expected).digest(),
    createHash("sha256").update(received).digest(),
  );
  const currentUser = tokenValid ? null : await getCurrentUser();
  if (!tokenValid && currentUser?.role !== "admin") return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  try {
    const records = await listLatestProcessingResults();
    const chatgpt = records.filter((record) => {
      const value = Array.isArray(record.result) ? record.result[0] : record.result;
      return value?.origem === "ChatGPT";
    });
    return NextResponse.json({
      commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
      databaseFingerprint: createHash("sha256")
        .update(String(process.env.DATABASE_URL || ""))
        .digest("hex").slice(0, 16),
      latestProcessingRecords: records.length,
      chatgptRecords: chatgpt.length,
      newestChatgpt: chatgpt.reduce((latest, record) =>
        record.createdAt > latest ? record.createdAt : latest, ""),
      requestedSkus: ["23254", "23252", "27995", "23251", "23253", "23255"].map((sku) => ({
        sku,
        found: chatgpt.some((record) => record.sku === sku),
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha na conferência." }, { status: 500 });
  }
}


const MIGRATION_TOKEN_HASH = "4d824badd00615f64a33c502e5c355f42efb26bfe375befc64809dc3049fbbbc";

type MigrationRecord = {
  requestId: string;
  sku: string;
  title: string;
  createdAt: string;
  result: Record<string, unknown>;
};

export async function POST(req: NextRequest) {
  const received = String(req.headers.get("x-processing-migration-token") || "");
  const hash = createHash("sha256").update(received).digest("hex");
  if (!received || !timingSafeEqual(Buffer.from(hash), Buffer.from(MIGRATION_TOKEN_HASH))) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const records = await req.json().catch(() => null) as MigrationRecord[] | null;
  if (!Array.isArray(records) || records.length < 1 || records.length > 75 || records.some((record) =>
    !record || typeof record.requestId !== "string" || !/^[a-zA-Z0-9_-]{1,180}$/.test(record.requestId) ||
    typeof record.sku !== "string" || !/^\d{1,12}$/.test(record.sku) ||
    typeof record.title !== "string" || record.title.length > 500 ||
    typeof record.createdAt !== "string" || !Number.isFinite(Date.parse(record.createdAt)) ||
    !record.createdAt.startsWith("2026-10-22") ||
    typeof record.result !== "object" || record.result === null || record.result.origem !== "ChatGPT"
  )) return NextResponse.json({ error: "Lote inválido." }, { status: 400 });

  const url = String(process.env.DATABASE_URL || "");
  const db = new Client({ connectionString: url });
  try {
    await db.connect();
    const result = await db.query(`
      WITH admin AS (SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1),
      incoming AS (
        SELECT * FROM jsonb_to_recordset($1::jsonb)
        AS item(request_id text, sku text, title text, created_at timestamptz, result_json jsonb)
      )
      INSERT INTO reprocess_jobs (request_id, sku, title, historical_date, user_id, status, result_json, source, created_at)
      SELECT 'codex-sync-' || incoming.request_id, incoming.sku, incoming.title, NULL,
        admin.id, 'enviado', incoming.result_json, 'reprocess', incoming.created_at
      FROM incoming CROSS JOIN admin
      ON CONFLICT (request_id) DO NOTHING
      RETURNING id
    `, [JSON.stringify(records.map((record) => ({
      request_id: record.requestId,
      sku: record.sku,
      title: record.title,
      created_at: record.createdAt,
      result_json: record.result,
    })))]);
    return NextResponse.json({ received: records.length, inserted: result.rowCount }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha na transferência." }, { status: 500 });
  } finally {
    await db.end().catch(() => {});
  }
}
