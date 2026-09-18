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


---

## Correção de autenticação Google Sheets (JSON direto)

Esta versão NÃO usa `GOOGLE_PRIVATE_KEY`, Base64 ou conversão de `\n`.

1. Baixe um JSON NOVO da Service Account no Google Cloud.
2. Renomeie para `google-service-account.json`.
3. Coloque em:

```text
credentials/google-service-account.json
```

4. Crie `.env.local` a partir de `.env.example`:

```env
GOOGLE_SHEET_ID=1yP52hwQnM4D0EykI03gY_Rq4azBGI4nQeIp1ZfTTu9s
GOOGLE_SHEET_NAME=Histórico A-Z
GOOGLE_SERVICE_ACCOUNT_FILE=credentials/google-service-account.json
```

5. Compartilhe a planilha com o `client_email` que existe dentro do JSON.
6. Rode:

```bash
npm run dev
```

7. Teste:

```text
http://localhost:3000/api/test-sheet
```

Se retornar `ok: true`, o Dashboard já pode usar a mesma autenticação.

O arquivo JSON está ignorado pelo `.gitignore` e NÃO deve ser enviado para o GitHub.

## Autenticação

O dashboard exige login e não possui cadastro público. Os usuários ficam no SQLite local em `data/auth.db`, que é ignorado pelo Git.

Para criar o primeiro administrador automaticamente, adicione ao `.env.local` antes de iniciar o servidor:

```env
AUTH_ADMIN_NAME=Administrador
AUTH_ADMIN_EMAIL=admin@exemplo.com
AUTH_ADMIN_PASSWORD=troque-por-uma-senha-forte-de-12
```

Ou crie usuários diretamente pelo comando administrativo:

```bash
npm run auth:create -- "Nome do usuário" email@empresa.com "senha-forte" user
```

O logout está disponível no rodapé da sidebar. Não existe rota de registro; novos acessos devem ser provisionados pelo banco ou pelo comando administrativo. As senhas precisam ter entre 12 e 256 caracteres.

---

## Integração n8n — Reprocessar

A versão atual possui integração de backend preparada para o botão **Reprocessar**.

Leia:

```text
N8N_REPROCESSAR.md
```

Variáveis necessárias:

```env
N8N_REPROCESS_WEBHOOK_URL=https://n8n.pitterpan.com.br/webhook/dashboard-reprocessar-produto
N8N_REPROCESS_TOKEN=TOKEN_FORTE
```

O token nunca é enviado ao navegador; a chamada ao n8n é feita pela API interna do Next.js.
