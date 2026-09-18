import { google } from "googleapis";

export async function GET() {
  try {
    const sheetId =
      process.env.GOOGLE_SHEET_ID;

    const sheetName =
      process.env.GOOGLE_SHEET_NAME;

    const credentialsBase64 =
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;

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

    if (!credentialsBase64) {
      throw new Error(
        "GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 não configurado."
      );
    }

    // ==========================================
    // DECODIFICAR JSON COMPLETO DA SERVICE ACCOUNT
    // ==========================================

    const credentialsJson =
      Buffer.from(
        credentialsBase64,
        "base64"
      ).toString("utf8");

    const credentials =
      JSON.parse(
        credentialsJson
      );

    // ==========================================
    // VALIDAR CREDENCIAIS
    // ==========================================

    if (!credentials.client_email) {
      throw new Error(
        "client_email não encontrado nas credenciais."
      );
    }

    if (!credentials.private_key) {
      throw new Error(
        "private_key não encontrada nas credenciais."
      );
    }

    // ==========================================
    // AUTENTICAÇÃO GOOGLE
    // ==========================================

    const auth =
      new google.auth.GoogleAuth({
        credentials,
        scopes: [
          "https://www.googleapis.com/auth/spreadsheets.readonly"
        ]
      });

    const sheets =
      google.sheets({
        version: "v4",
        auth
      });

    // ==========================================
    // TESTAR PLANILHA
    // ==========================================

    const response =
      await sheets.spreadsheets.values.get({
        spreadsheetId:
          sheetId,

        range:
          `'${sheetName}'!A1:N5`
      });

    return Response.json({
      ok: true,

      serviceAccount:
        credentials.client_email,

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