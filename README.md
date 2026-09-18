# Pitter Pan Festas — Dashboard Shopify V1

Dashboard em Node.js/Next.js conectado ao Google Sheets e preparado para integração com n8n.

## Recursos
- Dashboard com total processado, sucesso, erros, taxa de sucesso e tempo economizado.
- Cards de títulos, tags, coleções e descrições alteradas.
- Gráfico diário.
- Distribuição por marca.
- Página de Produtos.
- Página de Erros.
- Filtros por busca, marca e período.
- Botão de atualização manual.
- Endpoint pronto para reprocessamento via n8n.

## Colunas esperadas na planilha
Data/Hora, SKU, Marca, Título Antes, Título Depois, Tags Antes, Tags Depois, Coleções Antes, Coleções Depois, Título Alterado?, Tags Alteradas?, Coleções Alteradas?, Descrição Gerada?, Status

## Como rodar
1. `npm install`
2. Copie `.env.example` para `.env.local`
3. Configure as credenciais da Google Service Account.
4. Compartilhe a planilha com o e-mail da Service Account como leitor.
5. Execute `npm run dev`
6. Abra `http://localhost:3000`

## n8n
Configure:
- `N8N_REPROCESS_WEBHOOK_URL`
- `N8N_REPROCESS_TOKEN` (opcional)

O dashboard enviará:
```json
{
  "sku": "12345",
  "titulo": "Produto",
  "origem": "dashboard-pitter-pan"
}
```

## Próximas etapas
- login;
- detalhes do produto;
- reprocessamento real via n8n;
- relatórios exportáveis;
- logs;
- painel de exclusão;
- visão de filas/workers.
