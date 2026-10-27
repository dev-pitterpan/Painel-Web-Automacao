import oracledb from "oracledb";

const clientDir =
  process.env.ORACLE_CLIENT_DIR ||
  "C:\\Users\\administrativo18\\Downloads\\instantclient-basic-windows.x64-23.26.4.0.0\\instantclient_23_26";
const user = process.env.ORACLE_USER || "loja";
const connectString =
  process.env.ORACLE_CONNECT_STRING || "10.130.1.2:1521/WINTL";
const password = process.env.ORACLE_PASSWORD;
const token = process.env.WINTHOR_SYNC_TOKEN;
const dashboardUrl = (
  process.env.WINTHOR_DASHBOARD_URL || "https://catalogo-pro-sepia.vercel.app"
).replace(/\/$/, "");

if (!password || !token) {
  throw new Error(
    "Configure ORACLE_PASSWORD e WINTHOR_SYNC_TOKEN antes de sincronizar.",
  );
}

oracledb.initOracleClient({ libDir: clientDir });
let connection;
try {
  connection = await oracledb.getConnection({ user, password, connectString });
  const result = await connection.execute(
    `SELECT codprod, descricao, codfab, obs2, dtexclusao
       FROM pcprodut`,
    [],
    { resultSet: true, fetchArraySize: 500 },
  );
  const products = [];
  const outOfLine = [];
  try {
    let rows;
    while ((rows = await result.resultSet.getRows(500)).length) {
      for (const [
        code,
        description,
        manufacturerCode,
        status,
        excludedAt,
      ] of rows) {
        const sku = String(code ?? "").trim();
        if (!sku) continue;
        products.push({
          sku,
          manufacturerCode: String(manufacturerCode ?? "").trim(),
        });
        if (String(status ?? "").trim() === "FL" && !excludedAt) {
          outOfLine.push({
            sku,
            description: String(description ?? "").trim(),
          });
        }
      }
    }
  } finally {
    await result.resultSet.close();
  }

  if (products.length < 10_000 || outOfLine.length < 100) {
    throw new Error(
      "Consulta Oracle incompleta; nenhum dado foi enviado ao painel.",
    );
  }
  if (process.argv.includes("--dry-run")) {
    console.log(
      `Teste Oracle concluído: ${products.length} produtos, ${outOfLine.length} fora de linha. Nenhum dado enviado ao painel.`,
    );
    process.exitCode = 0;
  } else {
    const response = await fetch(`${dashboardUrl}/api/winthor-oracle-sync`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-pitterpan-token": token,
      },
      body: JSON.stringify({ products, outOfLine }),
      signal: AbortSignal.timeout(300_000),
    });
    const body = await response.json();
    if (!response.ok || !body.ok) {
      throw new Error(
        `Painel recusou a sincronização (${response.status}): ${body.error || "erro desconhecido"}`,
      );
    }
    console.log(
      `Oracle sincronizado: ${products.length} produtos, ${outOfLine.length} fora de linha, ${body.manufacturer?.updated ?? 0} códigos de fabricante atualizados.`,
    );
  }
} finally {
  if (connection) await connection.close();
}
