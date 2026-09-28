import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getCurrentUser, recordAudit, upsertProductOverride } from "@/lib/auth";

const TIMEOUT_MS = 25000;
const DEFAULT_WEBHOOK = "https://n8n.pitterpan.com.br/webhook/dashboard-editar-produto";

function cleanText(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanList(value: unknown) {
  const source = Array.isArray(value) ? value : String(value ?? "").split(",");
  return [...new Set(source.map(item => cleanText(item, 255)).filter(Boolean))].slice(0, 250);
}

async function callN8n(payload: Record<string, unknown>) {
  const url = cleanText(process.env.N8N_PRODUCT_EDITOR_WEBHOOK_URL || DEFAULT_WEBHOOK, 1000);
  const token = cleanText(process.env.N8N_PRODUCT_EDITOR_TOKEN || process.env.N8N_REPROCESS_TOKEN, 1000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-request-id": String(payload.request_id || ""), ...(token ? { "x-pitterpan-token": token } : {}) },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal,
    });
    const raw = await response.text();
    let data: any = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
    if (!response.ok || data?.ok === false) throw new Error(cleanText(data?.error || data?.message || raw || `HTTP ${response.status}`, 1200));
    return data || { ok: true };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Apenas administradores podem editar produtos." }, { status: 403 });
  const sku = cleanText(req.nextUrl.searchParams.get("sku"), 120);
  if (!sku) return NextResponse.json({ error: "SKU obrigatório." }, { status: 400 });
  const requestId = randomUUID();
  try {
    const result = await callN8n({ action: "lookup", request_id: requestId, sku, origem: "dashboard-pitter-pan" });
    return NextResponse.json({ ok: true, requestId, product: result.product || result.data || result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    await recordAudit({ userId: user.id, action: "product_lookup_failed", entity: "product", details: { requestId, sku, error: error instanceof Error ? error.message : "Falha desconhecida" } });
    return NextResponse.json({ error: error instanceof Error && error.name === "AbortError" ? "O n8n demorou para responder." : `Não foi possível consultar o Shopify: ${error instanceof Error ? error.message : "falha desconhecida"}` }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Apenas administradores podem editar produtos." }, { status: 403 });
  const body = await req.json().catch(() => null);
  const sku = cleanText(body?.sku, 120);
  const title = cleanText(body?.title, 255);
  const description = cleanText(body?.description, 100000);
  const tags = cleanList(body?.tags);
  const collections = cleanList(body?.collections);
  const weight = Number(body?.weight);
  const weightUnit = body?.weightUnit === "kg" ? "kg" : "g";
  if (!sku || !title) return NextResponse.json({ error: "SKU e título são obrigatórios." }, { status: 400 });
  if (!Number.isFinite(weight) || weight < 0 || weight > 1000000) return NextResponse.json({ error: "Peso inválido." }, { status: 400 });
  const requestId = randomUUID();
  const payload = { action: "update", request_id: requestId, sku, product: { title, description, tags, collections, weight, weightUnit }, origem: "dashboard-pitter-pan", solicitado_em: new Date().toISOString(), solicitado_por: { id: user.id, nome: user.name, email: user.email, perfil: user.role } };
  try {
    const result = await callN8n(payload);
    await upsertProductOverride(user, { sku, title, description, tags, collections, weight, weightUnit });
    await recordAudit({ userId: user.id, action: "product_updated", entity: "product", details: { requestId, sku, fields: ["title", "description", "tags", "collections", "weight"] } });
    return NextResponse.json({ ok: true, requestId, message: cleanText(result?.message || "Produto atualizado no Shopify.", 500), product: { title, description, tags, collections, weight, weightUnit } });
  } catch (error) {
    await recordAudit({ userId: user.id, action: "product_update_failed", entity: "product", details: { requestId, sku, error: error instanceof Error ? error.message : "Falha desconhecida" } });
    return NextResponse.json({ error: error instanceof Error && error.name === "AbortError" ? "O n8n demorou para responder." : `Não foi possível atualizar o Shopify: ${error instanceof Error ? error.message : "falha desconhecida"}` }, { status: 502 });
  }
}
