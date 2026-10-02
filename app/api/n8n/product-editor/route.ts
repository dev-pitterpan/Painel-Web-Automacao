import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  enqueueProductImageDeletions,
  enqueueProductImageReorder,
  enqueueProductImages,
  getCurrentUser,
  recordAudit,
  upsertProductOverride,
} from "@/lib/auth";

const TIMEOUT_MS = 25000;
const DEFAULT_WEBHOOK =
  "https://n8n.pitterpan.com.br/webhook/dashboard-editar-produto";

function cleanText(value: unknown, max: number) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function cleanList(value: unknown) {
  const source = Array.isArray(value) ? value : String(value ?? "").split(",");
  return [
    ...new Set(source.map((item) => cleanText(item, 255)).filter(Boolean)),
  ].slice(0, 250);
}

function cleanImages(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 5).map((item) => {
    const source = cleanText(item?.source, 1_500_000);
    const alt = cleanText(item?.alt, 500);
    const position = Number(item?.position);
    if (!/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(source))
      throw new Error("Uma das imagens enviadas é inválida.");
    if (!Number.isInteger(position) || position < 0 || position > 99)
      throw new Error("A posição de uma das imagens é inválida.");
    return { source, alt, position };
  });
}

function cleanMediaIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((item) => cleanText(item, 200))
        .filter((item) => /^gid:\/\/shopify\/MediaImage\/\d+$/.test(item)),
    ),
  ].slice(0, 50);
}

function cleanImagePositions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map(Number)
        .filter(
          (position) =>
            Number.isInteger(position) && position >= 0 && position <= 99,
        ),
    ),
  ].slice(0, 50);
}

function cleanMediaMoves(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).flatMap((item) => {
    const id = cleanText(item?.id, 200);
    const newPosition = Number(item?.newPosition);
    return /^gid:\/\/shopify\/MediaImage\/\d+$/.test(id) &&
      Number.isInteger(newPosition) &&
      newPosition >= 0 &&
      newPosition <= 99
      ? [{ id, newPosition }]
      : [];
  });
}

function cleanImageReorder(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).flatMap((item) => {
    const from = Number(item?.from);
    const to = Number(item?.to);
    return Number.isInteger(from) &&
      Number.isInteger(to) &&
      from >= 0 &&
      from <= 99 &&
      to >= 0 &&
      to <= 99 &&
      from !== to
      ? [{ from, to }]
      : [];
  });
}

async function callN8n(payload: Record<string, unknown>) {
  const url = cleanText(
    process.env.N8N_PRODUCT_EDITOR_WEBHOOK_URL || DEFAULT_WEBHOOK,
    1000,
  );
  const token = cleanText(
    process.env.N8N_PRODUCT_EDITOR_TOKEN || process.env.N8N_REPROCESS_TOKEN,
    1000,
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-request-id": String(payload.request_id || ""),
        ...(token ? { "x-pitterpan-token": token } : {}),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal,
    });
    const raw = await response.text();
    let data: any = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }
    if (!response.ok || data?.ok === false)
      throw new Error(
        cleanText(
          data?.error || data?.message || raw || `HTTP ${response.status}`,
          1200,
        ),
      );
    return data || { ok: true };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (user.role !== "admin")
    return NextResponse.json(
      { error: "Apenas administradores podem editar produtos." },
      { status: 403 },
    );
  const body = await req.json().catch(() => null);
  const sku = cleanText(body?.sku, 120);
  const titleHint = cleanText(body?.titleHint, 255);
  const title = cleanText(body?.title, 255);
  const description = cleanText(body?.description, 100000);
  const tags = cleanList(body?.tags);
  const collections = cleanList(body?.collections);
  const weight = Number(body?.weight);
  const weightUnit = body?.weightUnit === "kg" ? "kg" : "g";
  const deleteMediaIds = cleanMediaIds(body?.deleteMediaIds);
  const deleteImagePositions = cleanImagePositions(body?.deleteImagePositions);
  const mediaMoves = cleanMediaMoves(body?.mediaMoves);
  const imageReorder = cleanImageReorder(body?.imageReorder);
  let images: Array<{ source: string; alt: string; position: number }> = [];
  try {
    images = cleanImages(body?.images);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Imagem inválida." },
      { status: 400 },
    );
  }
  if (!sku || !title)
    return NextResponse.json(
      { error: "SKU e título são obrigatórios." },
      { status: 400 },
    );
  if (!Number.isFinite(weight) || weight < 0 || weight > 1000000)
    return NextResponse.json({ error: "Peso inválido." }, { status: 400 });
  const requestId = randomUUID();
  const payload = {
    action: "update",
    request_id: requestId,
    sku,
    title_hint: titleHint,
    product: {
      title,
      description,
      tags,
      collections,
      weight,
      weightUnit,
      images,
      deleteMediaIds,
      mediaMoves,
    },
    origem: "dashboard-pitter-pan",
    solicitado_em: new Date().toISOString(),
    solicitado_por: {
      id: user.id,
      nome: user.name,
      email: user.email,
      perfil: user.role,
    },
  };
  try {
    const result = await callN8n(payload);
    await upsertProductOverride(user, {
      sku,
      sourceTitle: titleHint,
      title,
      description,
      tags,
      collections,
      weight,
      weightUnit,
    });
    let imageSync: "queued" | "failed" | "not_required" = "not_required";
    if (images.length || deleteImagePositions.length || imageReorder.length) {
      try {
        if (deleteImagePositions.length)
          await enqueueProductImageDeletions(
            user,
            requestId,
            sku,
            deleteImagePositions,
          );
        if (imageReorder.length)
          await enqueueProductImageReorder(user, requestId, sku, imageReorder);
        if (images.length)
          await enqueueProductImages(user, requestId, sku, images);
        imageSync = "queued";
      } catch (syncError) {
        imageSync = "failed";
        await recordAudit({
          userId: user.id,
          action: "image_sync_queue_failed",
          entity: "product",
          details: {
            requestId,
            sku,
            error:
              syncError instanceof Error
                ? syncError.message
                : "Falha desconhecida",
          },
        });
      }
    }
    await recordAudit({
      userId: user.id,
      action: "product_updated",
      entity: "product",
      details: {
        requestId,
        sku,
        fields: [
          "title",
          "description",
          "tags",
          "collections",
          "weight",
          ...(images.length ? ["images"] : []),
          ...(deleteMediaIds.length ? ["deleted_images"] : []),
        ],
      },
    });
    return NextResponse.json({
      ok: true,
      requestId,
      imageSync,
      message: cleanText(
        imageSync === "failed"
          ? `${result?.message || "Produto atualizado no Shopify."} A cópia para a pasta local ficou pendente.`
          : result?.message || "Produto atualizado no Shopify.",
        500,
      ),
      product: {
        title,
        description,
        tags,
        collections,
        weight,
        weightUnit,
        images: result?.images || result?.product?.images || [],
      },
    });
  } catch (error) {
    await recordAudit({
      userId: user.id,
      action: "product_update_failed",
      entity: "product",
      details: {
        requestId,
        sku,
        error: error instanceof Error ? error.message : "Falha desconhecida",
      },
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.name === "AbortError"
            ? "O n8n demorou para responder."
            : `Não foi possível atualizar o Shopify: ${error instanceof Error ? error.message : "falha desconhecida"}`,
      },
      { status: 502 },
    );
  }
}
