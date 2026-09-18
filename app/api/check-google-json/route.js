import fs from "node:fs";
import path from "node:path";

export async function GET() {
  try {
    const arquivo = path.resolve(
      process.cwd(),
      "credentials/google-service-account.json"
    );

    const conteudo = fs.readFileSync(
      arquivo,
      "utf8"
    );

    const json = JSON.parse(conteudo);

    return Response.json({
      arquivoEncontrado: true,

      type:
        json.type || null,

      projectId:
        json.project_id || null,

      clientEmailConfigurado:
        typeof json.client_email === "string" &&
        json.client_email.length > 0,

      privateKeyConfigurada:
        typeof json.private_key === "string" &&
        json.private_key.length > 0,

      privateKeyTipo:
        typeof json.private_key,

      privateKeyInicio:
        typeof json.private_key === "string"
          ? json.private_key.slice(0, 27)
          : null,

      privateKeyLength:
        typeof json.private_key === "string"
          ? json.private_key.length
          : 0
    });

  } catch (error) {
    return Response.json(
      {
        ok: false,
        erro:
          error instanceof Error
            ? error.message
            : String(error)
      },
      {
        status: 500
      }
    );
  }
}