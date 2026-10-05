import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import {
  enqueueProductImageDeletions,
  enqueueProductImageReorder,
  enqueueProductImages,
  getShopifyCatalogProductDetails,
  getCurrentUser,
  recordAudit,
  upsertProductOverride,
  upsertShopifyCatalogProducts,
} from "@/lib/auth";
import {
  shopifyProductToCatalog,
  updateShopifyProduct,
  updateShopifyProductSalesChannels,
} from "@/lib/shopify-admin";

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

const PRODUCT_IMAGE_SIZE = 1000;
const PRODUCT_IMAGE_JPEG_QUALITY = 90;

async function normalizeProductImage(value: unknown) {
  const source = cleanText(value, 14_000_000);
  const match = /^data:image\/[a-z0-9.+-]+;base64,([a-z0-9+/=]+)$/i.exec(
    source,
  );
  if (!match) throw new Error("Uma das imagens enviadas é inválida.");
  const input = Buffer.from(match[1], "base64");
  if (!input.length || input.byteLength > 10 * 1024 * 1024)
    throw new Error("Use arquivos de imagem de até 10 MB.");
  try {
    const output = await sharp(input, { animated: false })
      .rotate()
      .resize(PRODUCT_IMAGE_SIZE, PRODUCT_IMAGE_SIZE, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: PRODUCT_IMAGE_JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
    return `data:image/jpeg;base64,${output.toString("base64")}`;
  } catch {
    throw new Error("Uma das imagens não pôde ser convertida para JPG.");
  }
}

async function cleanImages(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Promise.all(
    value.slice(0, 5).map(async (item) => {
      const source = await normalizeProductImage(item?.source);
      const alt = cleanText(item?.alt, 500);
      const position = Number(item?.position);
      if (!Number.isInteger(position) || position < 0 || position > 99)
        throw new Error("A posição de uma das imagens é inválida.");
      return { source, alt, position };
    }),
  );
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

function cleanPublicationChanges(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).flatMap((item) => {
    const publicationId = cleanText(item?.publicationId, 200);
    return /^gid:\/\/shopify\/Publication\/\d+$/.test(publicationId) &&
      typeof item?.published === "boolean"
      ? [{ publicationId, published: item.published }]
      : [];
  });
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
  const publicationChanges = cleanPublicationChanges(body?.publicationChanges);
  let images: Array<{ source: string; alt: string; position: number }> = [];
  try {
    images = await cleanImages(body?.images);
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
  try {
    const catalogProduct = await getShopifyCatalogProductDetails(
      sku,
      titleHint,
      false,
    );
    if (!catalogProduct?.id)
      return NextResponse.json(
        { error: "Produto não encontrado no catálogo sincronizado." },
        { status: 404 },
      );
    const updatedProduct = await updateShopifyProduct({
      productId: catalogProduct.id,
      title,
      descriptionHtml: description,
      tags,
      collections,
      weight,
      weightUnit,
      images,
      deleteMediaIds,
      mediaMoves,
    });
    const salesChannels = publicationChanges.length
      ? await updateShopifyProductSalesChannels(
          catalogProduct.id,
          publicationChanges,
        )
      : undefined;
    const synchronizedProduct = shopifyProductToCatalog(updatedProduct);
    await upsertShopifyCatalogProducts([synchronizedProduct]);
    await upsertProductOverride(user, {
      sku,
      sourceTitle: catalogProduct.title || titleHint || title,
      title: synchronizedProduct.title,
      description: synchronizedProduct.descriptionHtml,
      tags: synchronizedProduct.tags,
      collections: synchronizedProduct.collections,
      weight: synchronizedProduct.weight,
      weightUnit: synchronizedProduct.weightUnit,
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
          ...(publicationChanges.length ? ["sales_channels"] : []),
        ],
      },
    });
    return NextResponse.json({
      ok: true,
      requestId,
      imageSync,
      message: cleanText(
        imageSync === "failed"
          ? "Produto atualizado na Shopify. A cópia para a pasta local ficou pendente."
          : "Produto atualizado na Shopify.",
        500,
      ),
      product: {
        id: synchronizedProduct.shopifyId,
        title: synchronizedProduct.title,
        description: synchronizedProduct.descriptionHtml,
        tags: synchronizedProduct.tags,
        collections: synchronizedProduct.collections,
        weight: synchronizedProduct.weight,
        weightUnit: synchronizedProduct.weightUnit,
        images: synchronizedProduct.media,
        ...(salesChannels ? { salesChannels } : {}),
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
        error: `Não foi possível atualizar a Shopify: ${error instanceof Error ? error.message : "falha desconhecida"}`,
      },
      { status: 502 },
    );
  }
}
