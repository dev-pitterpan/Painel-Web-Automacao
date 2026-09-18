import { google } from "googleapis";
import type { HistoryRow } from "./types";

let cache:
  | {
      rows: HistoryRow[];
      expiresAt: number;
    }
  | null = null;

const boolPt = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase() === "sim";

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

  const sheetId =
    process.env.GOOGLE_SHEET_ID;

  const sheetName =
    process.env.GOOGLE_SHEET_NAME ||
    "Histórico";

  const email =
    process.env
      .GOOGLE_SERVICE_ACCOUNT_EMAIL;

  const key =
    process.env
      .GOOGLE_PRIVATE_KEY
      ?.replace(/\\n/g, "\n");

  if (!sheetId) {
    throw new Error(
      "GOOGLE_SHEET_ID não foi configurado no .env.local."
    );
  }

  if (!email) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_EMAIL não foi configurado no .env.local."
    );
  }

  if (!key) {
    throw new Error(
      "GOOGLE_PRIVATE_KEY não foi configurado no .env.local."
    );
  }

  try {
    const auth =
      new google.auth.JWT({
        email,
        key,
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
        `A planilha foi encontrada, mas faltam estas colunas no cabeçalho: ${missing.join(
          ", "
        )}`
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
      expiresAt:
        now + 30_000
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
