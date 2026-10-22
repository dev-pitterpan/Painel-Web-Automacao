import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Client } from "pg";
import { isSuccessfulReprocessResult } from "@/lib/auth";

export const runtime = "nodejs";

// The matching secret is stored only as CODEX_PROCESSING_WRITE_TOKEN in the local .env.local.
const TOKEN_HASH = "3e6a83cbacf0239c1e0c067ef34b6d98d2c6948de471b31590e68ef8778043e0";
const MAX_BODY_BYTES = 512_000;

type ProcessingRecord = {
  requestId: string;
  sku: string;
  title: string;
  createdAt: string;
  result: Record<string, unknown>;
};

function validRecord(record: ProcessingRecord, now: number) {
  if (!record || typeof record !== "object") return false;
  const timestamp = Date.parse(String(record.createdAt || ""));
  const result = record.result;
  return typeof record.requestId === "string" &&
    /^[a-zA-Z0-9_-]{1,180}$/.test(record.requestId) &&
    typeof record.sku === "string" && /^\d{1,12}$/.test(record.sku) &&
    typeof record.title === "string" && record.title.length > 0 && record.title.length <= 500 &&
    Number.isFinite(timestamp) &&
    timestamp >= now - 30 * 24 * 60 * 60 * 1000 &&
    timestamp <= now + 5 * 60 * 1000 &&
    result !== null && typeof result === "object" && !Array.isArray(result) &&
    result.origem === "ChatGPT" &&
    (result.sku === undefined || String(result.sku) === record.sku) &&
    typeof result.titulo_depois === "string" && result.titulo_depois.length > 0 &&
    isSuccessfulReprocessResult(result);
}

export async function POST(req: NextRequest) {
  const received = String(req.headers.get("x-chatgpt-processing-token") || "");
  const receivedHash = createHash("sha256").update(received).digest();
  if (!received || !timingSafeEqual(receivedHash, Buffer.from(TOKEN_HASH, "hex"))) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  if (Number(req.headers.get("content-length") || 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Lote muito grande." }, { status: 413 });
  }
  const body = await req.text();
  if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Lote muito grande." }, { status: 413 });
  }
  let records: ProcessingRecord[];
  try {
    records = JSON.parse(body) as ProcessingRecord[];
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const now = Date.now();
  if (!Array.isArray(records) || records.length < 1 || records.length > 75 ||
    records.some((record) => !validRecord(record, now))) {
    return NextResponse.json({ error: "Lote inválido." }, { status: 400 });
  }

  const databaseUrl = String(process.env.DATABASE_URL || "");
  if (!databaseUrl) {
    return NextResponse.json({ error: "Banco não configurado." }, { status: 500 });
  }
  const db = new Client({ connectionString: databaseUrl });
  try {
    await db.connect();
    const payload = records.map((record) => ({
      request_id: record.requestId,
      sku: record.sku,
      title: record.title,
      created_at: record.createdAt,
      result_json: {
        ...record.result,
        origem: "ChatGPT",
        data_hora: record.result.data_hora || record.createdAt,
      },
    }));
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
    `, [JSON.stringify(payload)]);
    return NextResponse.json(
      { received: records.length, inserted: result.rowCount },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao registrar produtos." },
      { status: 500 },
    );
  } finally {
    await db.end().catch(() => {});
  }
}
