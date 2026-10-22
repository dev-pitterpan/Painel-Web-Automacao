import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Uso: node scripts/record-chatgpt-processing.mjs <arquivo-json>');
  process.exit(2);
}

const envFile = fs.readFileSync(path.join(projectRoot, '.env.local'), 'utf8');
const tokenLine = envFile.split(/\r?\n/).find((line) => line.startsWith('CODEX_PROCESSING_WRITE_TOKEN='));
const token = tokenLine?.slice('CODEX_PROCESSING_WRITE_TOKEN='.length).trim().replace(/^"|"$/g, '');
if (!token) throw new Error('CODEX_PROCESSING_WRITE_TOKEN não encontrado em .env.local.');

const records = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
if (!Array.isArray(records) || records.length === 0) {
  throw new Error('O arquivo precisa conter uma lista não vazia de resultados.');
}

let inserted = 0;
for (let offset = 0; offset < records.length; offset += 75) {
  const batch = records.slice(offset, offset + 75);
  const response = await fetch('https://catalogo-pro-sepia.vercel.app/api/internal/chatgpt-processing', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-chatgpt-processing-token': token,
    },
    body: JSON.stringify(batch),
  });
  const result = await response.json();
  if (!response.ok || result.received !== batch.length || !Number.isInteger(result.inserted)) {
    throw new Error(`Lote ${Math.floor(offset / 75) + 1}: HTTP ${response.status} — ${result.error || 'resposta inesperada'}`);
  }
  inserted += result.inserted;
  console.log(`Lote ${Math.floor(offset / 75) + 1}: ${result.inserted} novos de ${result.received} recebidos.`);
}
console.log(`Concluído: ${inserted} novos registros de ${records.length} enviados.`);
