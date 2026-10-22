import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
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

