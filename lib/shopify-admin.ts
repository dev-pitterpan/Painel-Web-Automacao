import type { ShopifyCatalogSyncProduct } from "@/lib/auth";

type GraphqlError = { field?: string[]; message?: string };
type AdminToken = { value: string; expiresAt: number };
type ShopifyVariantNode = {
  id: string;
  title: string;
  sku: string;
  barcode: string;
  price: string;
  inventoryQuantity: number;
  inventoryItem?: {
    id: string;
    measurement?: { weight?: { value: number; unit: string } | null } | null;
  } | null;
};
type ShopifyProductNode = {
  id: string;
  title: string;
  handle: string;
  vendor: string;
  productType: string;
  status: string;
  tags: string[];
  descriptionHtml: string;
  updatedAt: string;
  featuredImage?: { url: string; altText?: string | null } | null;
  variants: { nodes: ShopifyVariantNode[] };
  collections: { nodes: Array<{ id: string; title: string }> };
  media: {
    nodes: Array<{
      __typename: string;
      id: string;
      alt?: string | null;
      image?: { url: string; altText?: string | null } | null;
    }>;
  };
};

export type ShopifyProductImageInput = {
  source: string;
  alt: string;
  position: number;
};

export type ShopifyProductUpdateInput = {
  productId: string;
  title: string;
  descriptionHtml: string;
  tags: string[];
  collections: string[];
  weight: number;
  weightUnit: "g" | "kg";
  images: ShopifyProductImageInput[];
  deleteMediaIds: string[];
  mediaMoves: Array<{ id: string; newPosition: number }>;
};

export type ShopifySalesChannel = {
  id: string;
  name: string;
  published: boolean;
};

export type ShopifyPublicationChange = {
  publicationId: string;
  published: boolean;
};

const PRODUCT_FIELDS = `
  id title handle vendor productType status tags descriptionHtml updatedAt
  featuredImage { url altText }
  variants(first: 250) {
    nodes {
      id title sku barcode price inventoryQuantity
      inventoryItem { id measurement { weight { value unit } } }
    }
  }
  collections(first: 250) { nodes { id title } }
  media(first: 250) {
    nodes {
      __typename
      ... on MediaImage { id alt image { url altText } }
    }
  }
`;

const globalShopify = globalThis as typeof globalThis & {
  shopifyAdminToken?: AdminToken;
};

function setting(name: string, fallback = "") {
  return String(process.env[name] || fallback).trim();
}

function shopDomain() {
  const configured = setting("SHOPIFY_STORE_DOMAIN")
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "");
  if (!configured) throw new Error("SHOPIFY_STORE_DOMAIN não configurado.");
  return configured.includes(".") ? configured : `${configured}.myshopify.com`;
}

function apiVersion() {
  return setting("SHOPIFY_API_VERSION", "2026-07");
}

function errorMessage(errors: GraphqlError[] | undefined, fallback: string) {
  const messages = (errors || [])
    .map((error) => String(error?.message || "").trim())
    .filter(Boolean);
  return messages.length ? messages.join(" ") : fallback;
}

async function accessToken(forceRefresh = false) {
  const staticToken = setting("SHOPIFY_ADMIN_ACCESS_TOKEN");
  if (staticToken) return staticToken;
  const cached = globalShopify.shopifyAdminToken;
  if (!forceRefresh && cached && cached.expiresAt > Date.now() + 60_000)
    return cached.value;
  const clientId = setting("SHOPIFY_CLIENT_ID");
  const clientSecret = setting("SHOPIFY_CLIENT_SECRET");
  if (!clientId || !clientSecret)
    throw new Error("Credenciais do aplicativo Shopify não configuradas.");
  const response = await fetch(
    `https://${shopDomain()}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token)
    throw new Error(
      `Não foi possível autenticar na Shopify (HTTP ${response.status}).`,
    );
  const expiresIn = Math.max(300, Number(payload.expires_in || 86_400));
  globalShopify.shopifyAdminToken = {
    value: String(payload.access_token),
    expiresAt: Date.now() + expiresIn * 1000,
  };
  return globalShopify.shopifyAdminToken.value;
}

export async function shopifyGraphql<T>(
  query: string,
  variables: Record<string, unknown> = {},
  retryAuthentication = true,
): Promise<T> {
  const token = await accessToken();
  const response = await fetch(
    `https://${shopDomain()}/admin/api/${apiVersion()}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    },
  );
  if (response.status === 401 && retryAuthentication) {
    globalShopify.shopifyAdminToken = undefined;
    await accessToken(true);
    return shopifyGraphql<T>(query, variables, false);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      `A Shopify respondeu com HTTP ${response.status}: ${String(payload?.errors?.[0]?.message || "falha desconhecida")}`,
    );
  if (payload?.errors?.length)
    throw new Error(errorMessage(payload.errors, "Erro na API da Shopify."));
  return payload.data as T;
}

export async function getShopifyAccessScopes() {
  const data = await shopifyGraphql<{
    currentAppInstallation: { accessScopes: Array<{ handle: string }> };
  }>(`{ currentAppInstallation { accessScopes { handle } } }`);
  return data.currentAppInstallation.accessScopes.map((scope) => scope.handle);
}

export async function fetchShopifyProduct(productId: string) {
  const data = await shopifyGraphql<{ product: ShopifyProductNode | null }>(
    `query DashboardProduct($id: ID!) { product(id: $id) { ${PRODUCT_FIELDS} } }`,
    { id: productId },
  );
  return data.product;
}

export async function getShopifyProductSalesChannels(productId: string) {
  const data = await shopifyGraphql<{
    publications: { nodes: Array<{ id: string; name: string }> };
    product: {
      resourcePublicationsV2: {
        nodes: Array<{
          isPublished: boolean;
          publication: { id: string };
        }>;
      };
    } | null;
  }>(
    `query DashboardProductSalesChannels($id: ID!) {
      publications(first: 100, catalogType: APP) {
        nodes { id name }
      }
      product(id: $id) {
        resourcePublicationsV2(first: 100, onlyPublished: false, catalogType: APP) {
          nodes { isPublished publication { id } }
        }
      }
    }`,
    { id: productId },
  );
  if (!data.product) throw new Error("Produto não encontrado na Shopify.");
  const published = new Map(
    data.product.resourcePublicationsV2.nodes.map((node) => [
      node.publication.id,
      node.isPublished,
    ]),
  );
  return data.publications.nodes
    .map((publication) => ({
      id: publication.id,
      name: publication.name || "Canal de venda",
      published: published.get(publication.id) === true,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
}

export async function getShopifySalesChannels() {
  const data = await shopifyGraphql<{
    publications: { nodes: Array<{ id: string; name: string }> };
  }>(`query DashboardSalesChannels {
    publications(first: 100, catalogType: APP) { nodes { id name } }
  }`);
  return data.publications.nodes
    .map((publication) => ({
      id: publication.id,
      name: publication.name || "Canal de venda",
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
}

export async function getShopifyProductSalesChannelCounts(
  productIds: string[],
) {
  const ids = [...new Set(productIds.filter(Boolean))].slice(0, 250);
  if (!ids.length) return new Map<string, number>();
  const data = await shopifyGraphql<{
    nodes: Array<{
      id: string;
      resourcePublicationsCount?: { count: number } | null;
    } | null>;
  }>(
    `query DashboardProductSalesChannelCounts($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on Product {
          id
          resourcePublicationsCount(onlyPublished: true) { count }
        }
      }
    }`,
    { ids },
  );
  return new Map(
    data.nodes.flatMap((node) =>
      node
        ? [
            [
              node.id,
              Number(node.resourcePublicationsCount?.count || 0),
            ] as const,
          ]
        : [],
    ),
  );
}

export async function updateShopifyProductSalesChannels(
  productId: string,
  changes: ShopifyPublicationChange[],
) {
  const publish = changes
    .filter((change) => change.published)
    .map((change) => ({ publicationId: change.publicationId }));
  const unpublish = changes
    .filter((change) => !change.published)
    .map((change) => ({ publicationId: change.publicationId }));
  if (publish.length) {
    const result = await shopifyGraphql<{
      publishablePublish: { userErrors: GraphqlError[] };
    }>(
      `mutation DashboardPublishProduct($id: ID!, $input: [PublicationInput!]!) {
        publishablePublish(id: $id, input: $input) {
          userErrors { field message }
        }
      }`,
      { id: productId, input: publish },
    );
    if (result.publishablePublish.userErrors?.length)
      throw new Error(
        errorMessage(
          result.publishablePublish.userErrors,
          "Não foi possível publicar o produto nos canais selecionados.",
        ),
      );
  }
  if (unpublish.length) {
    const result = await shopifyGraphql<{
      publishableUnpublish: { userErrors: GraphqlError[] };
    }>(
      `mutation DashboardUnpublishProductChannels($id: ID!, $input: [PublicationInput!]!) {
        publishableUnpublish(id: $id, input: $input) {
          userErrors { field message }
        }
      }`,
      { id: productId, input: unpublish },
    );
    if (result.publishableUnpublish.userErrors?.length)
      throw new Error(
        errorMessage(
          result.publishableUnpublish.userErrors,
          "Não foi possível remover o produto dos canais selecionados.",
        ),
      );
  }
  return getShopifyProductSalesChannels(productId);
}

function weightForDashboard(product: ShopifyProductNode) {
  const weight = product.variants.nodes.find(
    (variant) => variant.inventoryItem?.measurement?.weight,
  )?.inventoryItem?.measurement?.weight;
  if (!weight) return { weight: 0, weightUnit: "g" as const };
  if (weight.unit === "KILOGRAMS")
    return { weight: Number(weight.value || 0), weightUnit: "kg" as const };
  const factor =
    weight.unit === "POUNDS"
      ? 453.59237
      : weight.unit === "OUNCES"
        ? 28.349523
        : 1;
  return {
    weight: Number(weight.value || 0) * factor,
    weightUnit: "g" as const,
  };
}

export function shopifyProductToCatalog(
  product: ShopifyProductNode,
): ShopifyCatalogSyncProduct {
  const variants = product.variants.nodes.map((variant) => ({
    id: variant.id,
    title: variant.title || "",
    sku: variant.sku || "",
    barcode: variant.barcode || "",
    price: String(variant.price || "0"),
    inventoryQuantity: Number(variant.inventoryQuantity || 0),
  }));
  const media = product.media.nodes.flatMap((item) =>
    item.__typename === "MediaImage" && item.image?.url
      ? [
          {
            id: item.id,
            url: item.image.url,
            alt: String(item.alt || item.image.altText || ""),
          },
        ]
      : [],
  );
  const prices = variants.map((variant) => Number(variant.price || 0));
  const productWeight = weightForDashboard(product);
  return {
    shopifyId: product.id,
    title: product.title || "",
    handle: product.handle || "",
    status: product.status || "DRAFT",
    vendor: product.vendor || "",
    productType: product.productType || "",
    tags: (product.tags || []).map(String),
    collections: product.collections.nodes.map(
      (collection) => collection.title,
    ),
    descriptionHtml: product.descriptionHtml || "",
    imageUrl: media[0]?.url || product.featuredImage?.url || "",
    imageAlt:
      media[0]?.alt || product.featuredImage?.altText || product.title || "",
    media,
    ...productWeight,
    sku: variants.find((variant) => variant.sku)?.sku || "",
    variants,
    totalInventory: variants.reduce(
      (total, variant) => total + variant.inventoryQuantity,
      0,
    ),
    priceMin: prices.length ? Math.min(...prices) : 0,
    priceMax: prices.length ? Math.max(...prices) : 0,
    shopifyUpdatedAt: product.updatedAt || new Date().toISOString(),
  };
}

async function resolveCollections(
  desiredTitles: string[],
  current: Array<{ id: string; title: string }>,
) {
  const normalize = (value: string) => value.trim().toLocaleLowerCase("pt-BR");
  const desired = [
    ...new Set(desiredTitles.map((title) => title.trim()).filter(Boolean)),
  ];
  const currentByTitle = new Map(
    current.map((collection) => [normalize(collection.title), collection.id]),
  );
  const desiredIds: string[] = [];
  for (const title of desired) {
    const existing = currentByTitle.get(normalize(title));
    if (existing) {
      desiredIds.push(existing);
      continue;
    }
    const search = await shopifyGraphql<{
      collections: { nodes: Array<{ id: string; title: string }> };
    }>(
      `query DashboardCollections($query: String!) {
        collections(first: 20, query: $query) { nodes { id title } }
      }`,
      { query: `title:'${title.replaceAll("'", "\\'")}'` },
    );
    const match = search.collections.nodes.find(
      (collection) => normalize(collection.title) === normalize(title),
    );
    if (match) {
      desiredIds.push(match.id);
      continue;
    }
    const created = await shopifyGraphql<{
      collectionCreate: {
        collection: { id: string; title: string } | null;
        userErrors: GraphqlError[];
      };
    }>(
      `mutation CreateDashboardCollection($collection: CollectionCreateInput!) {
        collectionCreate(collection: $collection) {
          collection { id title }
          userErrors { field message }
        }
      }`,
      { collection: { title } },
    );
    if (created.collectionCreate.userErrors?.length)
      throw new Error(
        errorMessage(
          created.collectionCreate.userErrors,
          `Não foi possível criar a coleção ${title}.`,
        ),
      );
    if (!created.collectionCreate.collection)
      throw new Error(`A coleção ${title} não foi criada.`);
    desiredIds.push(created.collectionCreate.collection.id);
  }
  const desiredSet = new Set(desiredIds);
  return {
    join: desiredIds.filter(
      (id) => !current.some((collection) => collection.id === id),
    ),
    leave: current
      .map((collection) => collection.id)
      .filter((id) => !desiredSet.has(id)),
  };
}

function decodeDataImage(source: string, index: number) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=]+)$/i.exec(
    source,
  );
  if (!match) throw new Error("Uma das imagens enviadas é inválida.");
  const mimeType = match[1].toLowerCase();
  const buffer = Buffer.from(match[2], "base64");
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1];
  return {
    buffer,
    mimeType,
    filename: `produto-${Date.now()}-${index + 1}.${extension}`,
  };
}

async function stageImages(images: ShopifyProductImageInput[]) {
  if (!images.length) return [];
  const files = images.map((image, index) => ({
    ...decodeDataImage(image.source, index),
    alt: image.alt,
  }));
  const staged = await shopifyGraphql<{
    stagedUploadsCreate: {
      stagedTargets: Array<{
        url: string;
        resourceUrl: string;
        parameters: Array<{ name: string; value: string }>;
      }>;
      userErrors: GraphqlError[];
    };
  }>(
    `mutation DashboardStagedUploads($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }`,
    {
      input: files.map((file) => ({
        resource: "IMAGE",
        filename: file.filename,
        mimeType: file.mimeType,
        httpMethod: "POST",
        fileSize: String(file.buffer.byteLength),
      })),
    },
  );
  if (staged.stagedUploadsCreate.userErrors?.length)
    throw new Error(
      errorMessage(
        staged.stagedUploadsCreate.userErrors,
        "A Shopify recusou o envio das imagens.",
      ),
    );
  if (staged.stagedUploadsCreate.stagedTargets.length !== files.length)
    throw new Error("A Shopify não preparou todos os uploads solicitados.");
  const media = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const target = staged.stagedUploadsCreate.stagedTargets[index];
    const form = new FormData();
    target.parameters.forEach((parameter) =>
      form.append(parameter.name, parameter.value),
    );
    form.append(
      "file",
      new Blob([file.buffer], { type: file.mimeType }),
      file.filename,
    );
    const upload = await fetch(target.url, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    if (!upload.ok)
      throw new Error(
        `Falha no upload da imagem ${index + 1} (HTTP ${upload.status}).`,
      );
    media.push({
      originalSource: target.resourceUrl,
      alt: file.alt,
      mediaContentType: "IMAGE",
    });
  }
  return media;
}

async function updateWeight(
  variants: ShopifyVariantNode[],
  value: number,
  unit: "g" | "kg",
) {
  for (const variant of variants) {
    const inventoryItemId = variant.inventoryItem?.id;
    if (!inventoryItemId) continue;
    const result = await shopifyGraphql<{
      inventoryItemUpdate: { userErrors: GraphqlError[] };
    }>(
      `mutation DashboardInventoryWeight($id: ID!, $input: InventoryItemInput!) {
        inventoryItemUpdate(id: $id, input: $input) {
          userErrors { field message }
        }
      }`,
      {
        id: inventoryItemId,
        input: {
          measurement: {
            weight: {
              value,
              unit: unit === "kg" ? "KILOGRAMS" : "GRAMS",
            },
          },
        },
      },
    );
    if (result.inventoryItemUpdate.userErrors?.length)
      throw new Error(
        errorMessage(
          result.inventoryItemUpdate.userErrors,
          "Não foi possível atualizar o peso.",
        ),
      );
  }
}

export async function updateShopifyProduct(input: ShopifyProductUpdateInput) {
  const current = await fetchShopifyProduct(input.productId);
  if (!current) throw new Error("Produto não encontrado na Shopify.");
  const collections = await resolveCollections(
    input.collections,
    current.collections.nodes,
  );
  const newMedia = await stageImages(input.images);
  const updated = await shopifyGraphql<{
    productUpdate: {
      product: { id: string } | null;
      userErrors: GraphqlError[];
    };
  }>(
    `mutation DashboardProductUpdate(
      $product: ProductUpdateInput!
      $media: [CreateMediaInput!]
    ) {
      productUpdate(product: $product, media: $media) {
        product { id }
        userErrors { field message }
      }
    }`,
    {
      product: {
        id: input.productId,
        title: input.title,
        descriptionHtml: input.descriptionHtml,
        tags: input.tags,
        collectionsToJoin: collections.join,
        collectionsToLeave: collections.leave,
      },
      media: newMedia,
    },
  );
  if (updated.productUpdate.userErrors?.length)
    throw new Error(
      errorMessage(
        updated.productUpdate.userErrors,
        "A Shopify recusou a atualização.",
      ),
    );
  await updateWeight(current.variants.nodes, input.weight, input.weightUnit);
  if (input.deleteMediaIds.length) {
    const deleted = await shopifyGraphql<{
      fileDelete: { userErrors: GraphqlError[] };
    }>(
      `mutation DashboardDeleteMedia($fileIds: [ID!]!) {
        fileDelete(fileIds: $fileIds) { userErrors { field message } }
      }`,
      { fileIds: input.deleteMediaIds },
    );
    if (deleted.fileDelete.userErrors?.length)
      throw new Error(
        errorMessage(
          deleted.fileDelete.userErrors,
          "Não foi possível excluir uma das imagens.",
        ),
      );
  }
  if (input.mediaMoves.length) {
    const reordered = await shopifyGraphql<{
      productReorderMedia: { userErrors: GraphqlError[] };
    }>(
      `mutation DashboardReorderMedia($id: ID!, $moves: [MoveInput!]!) {
        productReorderMedia(id: $id, moves: $moves) {
          userErrors { field message }
        }
      }`,
      {
        id: input.productId,
        moves: input.mediaMoves.map((move) => ({
          id: move.id,
          newPosition: String(move.newPosition),
        })),
      },
    );
    if (reordered.productReorderMedia.userErrors?.length)
      throw new Error(
        errorMessage(
          reordered.productReorderMedia.userErrors,
          "Não foi possível reordenar as imagens.",
        ),
      );
  }
  let product = await fetchShopifyProduct(input.productId);
  for (let attempt = 0; product && attempt < 4; attempt += 1) {
    if (
      product.media.nodes.length >=
      current.media.nodes.length -
        input.deleteMediaIds.length +
        input.images.length
    )
      break;
    await new Promise((resolve) => setTimeout(resolve, 750));
    product = await fetchShopifyProduct(input.productId);
  }
  if (!product) throw new Error("Produto atualizado, mas não pôde ser relido.");
  return product;
}

export async function archiveShopifyProduct(productId: string) {
  const result = await shopifyGraphql<{
    productUpdate: {
      product: ShopifyProductNode | null;
      userErrors: GraphqlError[];
    };
  }>(
    `mutation DashboardArchiveProduct($product: ProductUpdateInput!) {
      productUpdate(product: $product) {
        product { ${PRODUCT_FIELDS} }
        userErrors { field message }
      }
    }`,
    { product: { id: productId, status: "ARCHIVED" } },
  );
  if (result.productUpdate.userErrors?.length || !result.productUpdate.product)
    throw new Error(
      errorMessage(
        result.productUpdate.userErrors,
        "Não foi possível arquivar o produto.",
      ),
    );
  return result.productUpdate.product;
}

export async function deleteShopifyProduct(productId: string) {
  const result = await shopifyGraphql<{
    productDelete: {
      deletedProductId: string | null;
      userErrors: GraphqlError[];
    };
  }>(
    `mutation DashboardDeleteProduct($input: ProductDeleteInput!) {
      productDelete(input: $input, synchronous: true) {
        deletedProductId
        userErrors { field message }
      }
    }`,
    { input: { id: productId } },
  );
  if (
    result.productDelete.userErrors?.length ||
    !result.productDelete.deletedProductId
  )
    throw new Error(
      errorMessage(
        result.productDelete.userErrors,
        "Não foi possível excluir o produto.",
      ),
    );
}

export async function unpublishShopifyProduct(productId: string) {
  const product = await shopifyGraphql<{
    product: {
      resourcePublicationsV2: {
        nodes: Array<{ publication: { id: string } }>;
      };
    } | null;
  }>(
    `query DashboardProductPublications($id: ID!) {
      product(id: $id) {
        resourcePublicationsV2(first: 100, onlyPublished: true) {
          nodes { publication { id } }
        }
      }
    }`,
    { id: productId },
  );
  if (!product.product) throw new Error("Produto não encontrado na Shopify.");
  const input = product.product.resourcePublicationsV2.nodes.map((node) => ({
    publicationId: node.publication.id,
  }));
  if (!input.length) return;
  const result = await shopifyGraphql<{
    publishableUnpublish: { userErrors: GraphqlError[] };
  }>(
    `mutation DashboardUnpublishProduct($id: ID!, $input: [PublicationInput!]!) {
      publishableUnpublish(id: $id, input: $input) {
        userErrors { field message }
      }
    }`,
    { id: productId, input },
  );
  if (result.publishableUnpublish.userErrors?.length)
    throw new Error(
      errorMessage(
        result.publishableUnpublish.userErrors,
        "Não foi possível remover o produto dos canais.",
      ),
    );
}
