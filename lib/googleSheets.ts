import { google } from "googleapis";
import type { ExcludedProductRow, HistoryRow } from "./types";
import path from "node:path";
import fs from "node:fs";

let cache:
  | {
      rows: HistoryRow[];
      expiresAt: number;
      syncedAt: string;
    }
  | null = null;

let excludedCache:
  | {
      rows: ExcludedProductRow[];
      expiresAt: number;
      syncedAt: string;
    }
  | null = null;

const boolPt = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase() === "sim";

function getGoogleConfig() {
  const sheetId =
    String(
      process.env.GOOGLE_SHEET_ID || ""
    ).trim();

  const sheetName =
    String(
      process.env.GOOGLE_SHEET_NAME ||
      "Histórico"
    ).trim();

  const credentialsFile =
    String(
      process.env.GOOGLE_SERVICE_ACCOUNT_FILE ||
      "credentials/google-service-account.json"
    ).trim();

  if (!sheetId) {
    throw new Error(
      "GOOGLE_SHEET_ID não foi configurado no .env.local."
    );
  }

  if (!sheetName) {
    throw new Error(
      "GOOGLE_SHEET_NAME não foi configurado no .env.local."
    );
  }

  const keyFile = path.resolve(process.cwd(), credentialsFile);
  const clientEmail = String(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "").trim();
  const privateKey = String(process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();

  if ((!clientEmail || !privateKey) && !fs.existsSync(keyFile)) {
    throw new Error(
      "Configure GOOGLE_SERVICE_ACCOUNT_EMAIL e GOOGLE_PRIVATE_KEY ou forneça o arquivo da Service Account."
    );
  }

  return {
    sheetId,
    sheetName,
    keyFile,
    credentials: clientEmail && privateKey ? { client_email: clientEmail, private_key: privateKey } : undefined,
  };
}

function getExcludedGoogleConfig() {
  const base = getGoogleConfig();
  return {
    ...base,
    sheetId: String(process.env.GOOGLE_EXCLUDED_SHEET_ID || "1TUbzV39PgSW6CqNN31IGW3JVab4v9l_sHUKVNJfiT3Y").trim(),
    sheetName: String(process.env.GOOGLE_EXCLUDED_SHEET_NAME || "Produtos").trim(),
  };
}

export async function getHistoryRows(
  force = false
): Promise<HistoryRow[]> {
  const now = Date.now();

  if (
    !force &&
    cache &&
    cache.expiresAt > now
  ) {
    return cache.rows;
  }

    const { sheetId, sheetName, keyFile, credentials } = getGoogleConfig();

  try {
    // O GoogleAuth lê o JSON oficial diretamente do disco.
    // Não há conversão de PEM, Base64 ou \n.
    const auth = new google.auth.GoogleAuth({
        ...(credentials ? { credentials } : { keyFile }),
        scopes: [
          "https://www.googleapis.com/auth/spreadsheets.readonly"
        ]
      });

    const sheets =
      google.sheets({
        version: "v4",
        auth
      });

    const response =
      await sheets
        .spreadsheets
        .values
        .get({
          spreadsheetId:
            sheetId,

          range:
            `'${sheetName}'!A:N`
        });

    const values =
      response.data.values ?? [];

    if (!values.length) {
      throw new Error(
        `A aba "${sheetName}" está vazia ou não foi encontrada.`
      );
    }

    const header =
      values[0].map(value =>
        String(value).trim()
      );

    const required = [
      "Data/Hora",
      "SKU",
      "Marca",
      "Título Antes",
      "Título Depois",
      "Tags Antes",
      "Tags Depois",
      "Coleções Antes",
      "Coleções Depois",
      "Título Alterado?",
      "Tags Alteradas?",
      "Coleções Alteradas?",
      "Descrição Gerada?",
      "Status"
    ];

    const missing =
      required.filter(
        name =>
          !header.includes(name)
      );

    if (missing.length) {
      throw new Error(
        `A planilha foi encontrada, mas faltam estas colunas no cabeçalho: ${missing.join(", ")}`
      );
    }

    const idx = (name: string) =>
      header.indexOf(name);

    const rows =
      values
        .slice(1)
        .filter(row =>
          row.some(value =>
            String(value ?? "")
              .trim()
          )
        )
        .map(row => ({
          dataHora:
            String(
              row[
                idx("Data/Hora")
              ] ?? ""
            ),

          sku:
            String(
              row[
                idx("SKU")
              ] ?? ""
            ),

          marca:
            String(
              row[
                idx("Marca")
              ] ?? ""
            ),

          tituloAntes:
            String(
              row[
                idx("Título Antes")
              ] ?? ""
            ),

          tituloDepois:
            String(
              row[
                idx("Título Depois")
              ] ?? ""
            ),

          tagsAntes:
            String(
              row[
                idx("Tags Antes")
              ] ?? ""
            ),

          tagsDepois:
            String(
              row[
                idx("Tags Depois")
              ] ?? ""
            ),

          colecoesAntes:
            String(
              row[
                idx("Coleções Antes")
              ] ?? ""
            ),

          colecoesDepois:
            String(
              row[
                idx("Coleções Depois")
              ] ?? ""
            ),

          tituloAlterado:
            boolPt(
              row[
                idx(
                  "Título Alterado?"
                )
              ]
            ),

          tagsAlteradas:
            boolPt(
              row[
                idx(
                  "Tags Alteradas?"
                )
              ]
            ),

          colecoesAlteradas:
            boolPt(
              row[
                idx(
                  "Coleções Alteradas?"
                )
              ]
            ),

          descricaoGerada:
            boolPt(
              row[
                idx(
                  "Descrição Gerada?"
                )
              ]
            ),

          status:
            String(
              row[
                idx("Status")
              ] ?? ""
            )
        }));

    cache = {
      rows,
      expiresAt: now + 30_000,
      syncedAt: new Date().toISOString()
    };

    return rows;
  } catch (error: any) {
    const message =
      error?.response?.data
        ?.error?.message ||
      error?.message ||
      "Erro desconhecido.";

    throw new Error(
      `Falha ao ler o Google Sheets. ${message}`
    );
  }
}

export async function getHistoryRowsWithStatus(force = false) {
  const rows = await getHistoryRows(force);
  return {
    rows,
    lastSyncedAt: cache?.syncedAt || new Date().toISOString(),
    sheetName: getGoogleConfig().sheetName
  };
}

export async function getExcludedProductRows(force = false): Promise<ExcludedProductRow[]> {
  const now = Date.now();
  if (!force && excludedCache && excludedCache.expiresAt > now) return excludedCache.rows;

  const { sheetId, sheetName, keyFile, credentials } = getExcludedGoogleConfig();
  try {
    const auth = new google.auth.GoogleAuth({
      ...(credentials ? { credentials } : { keyFile }),
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `'${sheetName}'!A:I`,
    });
    const values = response.data.values ?? [];
    if (!values.length) throw new Error(`A aba "${sheetName}" está vazia ou não foi encontrada.`);

    const normalize = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const header = values[0].map(normalize);
    const aliases: Record<keyof ExcludedProductRow, string[]> = {
      productCode: ["cod. produto", "cod produto", "codigo produto"],
      manufacturerCode: ["cod. fabricante", "cod fabricante", "codigo fabricante"],
      barcode: ["ean / cod. barras", "ean/cod. barras", "ean / codigo barras", "ean"],
      description: ["descricao"],
      unit: ["unidade"],
      exclusionDate: ["data exclusao"],
      shopifyStatus: ["status shopify"],
      shopifyId: ["id shopify"],
      shopifyError: ["erro shopify"],
    };
    const indexes = Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, header.findIndex(item => names.includes(item))])) as Record<keyof ExcludedProductRow, number>;
    const missing = Object.entries(indexes).filter(([, index]) => index < 0).map(([key]) => key);
    if (missing.length) throw new Error(`A planilha foi encontrada, mas o cabeçalho não corresponde às colunas esperadas: ${missing.join(", ")}.`);

    const rows = values.slice(1)
      .filter(row => row.some(value => String(value ?? "").trim()))
      .map(row => ({
        productCode: String(row[indexes.productCode] ?? "").trim(),
        manufacturerCode: String(row[indexes.manufacturerCode] ?? "").trim(),
        barcode: String(row[indexes.barcode] ?? "").trim(),
        description: String(row[indexes.description] ?? "").trim(),
        unit: String(row[indexes.unit] ?? "").trim(),
        exclusionDate: String(row[indexes.exclusionDate] ?? "").trim(),
        shopifyStatus: String(row[indexes.shopifyStatus] ?? "").trim(),
        shopifyId: String(row[indexes.shopifyId] ?? "").trim(),
        shopifyError: String(row[indexes.shopifyError] ?? "").trim(),
      }));

    excludedCache = { rows, expiresAt: now + 30_000, syncedAt: new Date().toISOString() };
    return rows;
  } catch (error: any) {
    const message = error?.response?.data?.error?.message || error?.message || "Erro desconhecido.";
    throw new Error(`Falha ao ler a planilha de produtos excluídos. ${message}`);
  }
}

export async function getExcludedProductRowsWithStatus(force = false) {
  const rows = await getExcludedProductRows(force);
  return {
    rows,
    lastSyncedAt: excludedCache?.syncedAt || new Date().toISOString(),
    sheetName: getExcludedGoogleConfig().sheetName,
  };
}
