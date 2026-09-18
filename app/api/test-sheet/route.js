import { google } from "googleapis";
import path from "node:path";
import fs from "node:fs";

export async function GET() {
  try {
    const sheetId =
      String(
        process.env.GOOGLE_SHEET_ID || ""
      ).trim();

    const sheetName =
      String(
        process.env.GOOGLE_SHEET_NAME || ""
      ).trim();

    const credentialsFile =
      String(
        process.env.GOOGLE_SERVICE_ACCOUNT_FILE ||
        "credentials/google-service-account.json"
      ).trim();

    if (!sheetId) {
      throw new Error(
        "GOOGLE_SHEET_ID não configurado."
      );
    }

    if (!sheetName) {
      throw new Error(
        "GOOGLE_SHEET_NAME não configurado."
      );
    }

    const keyFile =
      path.resolve(
        process.cwd(),
        credentialsFile
      );

    if (!fs.existsSync(keyFile)) {
      throw new Error(
        `Arquivo da Service Account não encontrado em: ${keyFile}`
      );
    }

    // Usa o JSON oficial da Service Account diretamente.
    const auth =
      new google.auth.GoogleAuth({
        keyFile,
        scopes: [
          "https://www.googleapis.com/auth/spreadsheets.readonly"
        ]
      });

    // Força a autenticação aqui para que erros de credencial
    // apareçam de forma clara antes da consulta da planilha.
    const client =
      await auth.getClient();

    const sheets =
      google.sheets({
        version: "v4",
        auth: client
      });

    const response =
      await sheets
        .spreadsheets
        .values
        .get({
          spreadsheetId:
            sheetId,

          range:
            `'${sheetName}'!A1:N5`
        });

    return Response.json({
      ok: true,
      arquivoCredencial:
        credentialsFile,
      linhas:
        response.data.values || []
    });
  } catch (error) {
    console.error(
      "ERRO GOOGLE SHEETS:",
      error
    );

    return Response.json(
      {
        ok: false,
        erro:
          error?.response?.data
            ?.error?.message ||
          error?.message ||
          String(error)
      },
      {
        status: 500
      }
    );
  }
}
