import { spawnSync } from "node:child_process";
import path from "node:path";

process.loadEnvFile(path.join(process.cwd(), ".env.local"));

const configDir = process.argv[2];
if (!configDir) throw new Error("Informe a pasta de configuração global da Vercel.");

const names = [
  "GOOGLE_SHEET_ID",
  "GOOGLE_SHEET_NAME",
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_PRIVATE_KEY",
  "N8N_REPROCESS_WEBHOOK_URL",
  "N8N_REPROCESS_TOKEN",
  "N8N_REPROCESS_CALLBACK_TOKEN",
];

for (const name of names) {
  const value = String(process.env[name] || "").trim();
  if (!value) continue;
  const npxCommand = "npx";
  const result = spawnSync(npxCommand, [
    "vercel", "env", "add", name, "production,preview,development",
    "--force", "--sensitive", "--yes", "--global-config", configDir,
  ], { cwd: process.cwd(), input: `${value}\n`, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], shell: process.platform === "win32", windowsHide: true });
  if (result.status !== 0) throw new Error(`Falha ao configurar ${name}: ${result.error?.message || result.stderr || result.stdout}`);
  console.log(`${name}: configurada`);
}
