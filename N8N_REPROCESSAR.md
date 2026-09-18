# Integração real com n8n — botão Reprocessar

## Nível de dificuldade

**4/10** para colocar o botão funcionando com segurança.

O dashboard já está preparado para chamar o n8n pelo backend. Falta criar o workflow receptor no n8n e conectá-lo à automação principal.

## O que o site envia

`POST` para `N8N_REPROCESS_WEBHOOK_URL` com header:

```text
x-pitterpan-token: <N8N_REPROCESS_TOKEN>
```

Payload:

```json
{
  "request_id": "uuid-da-requisicao",
  "sku": "32407",
  "titulo": "Forma de Alumínio Suíça N.15 13x14cm",
  "data_hora_historico": "17/09/2026 10:20:30",
  "origem": "dashboard-pitter-pan",
  "solicitado_em": "2026-09-18T13:40:00.000Z",
  "solicitado_por": {
    "id": 1,
    "nome": "Administrador",
    "email": "admin@empresa.com",
    "perfil": "admin"
  }
}
```

## Configuração do `.env.local`

Adicione:

```env
N8N_REPROCESS_WEBHOOK_URL=https://n8n.pitterpan.com.br/webhook/dashboard-reprocessar-produto
N8N_REPROCESS_TOKEN=COLOQUE_UM_TOKEN_LONGO_E_ALEATORIO
```

Depois reinicie o Next.js.

## Workflow recomendado no n8n

Crie um workflow separado chamado:

```text
Dashboard - Reprocessar Produto
```

### 01 - Webhook Reprocessar Produto

- Node: **Webhook**
- Method: `POST`
- Path: `dashboard-reprocessar-produto`
- Response: usando **Respond to Webhook**
- Segurança: use **Header Auth** no próprio Webhook.

Credencial Header Auth:

```text
Header name: x-pitterpan-token
Header value: exatamente o mesmo N8N_REPROCESS_TOKEN usado no site
```

Isso é melhor do que validar o token manualmente em um Code node.

### 02 - Validar Entrada

Use um Code node:

```javascript
const body = $json.body || $json;

const sku = String(body.sku || '').trim();
const titulo = String(body.titulo || '').trim();
const requestId = String(body.request_id || '').trim();

if (!sku) {
  throw new Error('SKU obrigatório para reprocessamento.');
}

return {
  request_id: requestId,
  sku,
  titulo,
  origem: body.origem || 'dashboard-pitter-pan',
  solicitado_em: body.solicitado_em || new Date().toISOString(),
  solicitado_por: body.solicitado_por || null
};
```

### 03 - Buscar Produto Shopify por SKU

A busca deve usar o SKU como chave principal.

Sugestão GraphQL:

```graphql
query BuscarProdutoPorSku($query: String!) {
  productVariants(first: 10, query: $query) {
    nodes {
      id
      sku
      product {
        id
        title
        vendor
      }
    }
  }
}
```

Variables:

```json
{
  "query": "sku:32407"
}
```

No n8n, substitua pelo SKU recebido.

### 04 - Confirmar Resultado

Valide:

- encontrou exatamente uma variante com aquele SKU;
- o SKU retornado é idêntico ao solicitado;
- existe `product.id`.

Se não encontrar, responda ao dashboard com erro e NÃO acione a automação principal.

### 05 - Preparar Entrada da Automação Principal

Saída recomendada:

```json
{
  "product_id": "gid://shopify/Product/123456",
  "sku": "32407",
  "titulo_atual": "Produto encontrado no Shopify",
  "origem": "dashboard-reprocessamento",
  "request_id": "uuid"
}
```

### 06 - Executar Automação Principal

A opção mais organizada é usar **Execute Workflow** e fazer a automação principal aceitar entrada por um **Execute Workflow Trigger**.

Assim você não duplica toda a lógica de cadastro/classificação.

Fluxo:

```text
Dashboard
  ↓
Webhook Reprocessar
  ↓
Buscar produto por SKU
  ↓
Execute Workflow
  ↓
Automação principal existente
```

**Não conecte ainda este node sem revisar a entrada da sua automação principal.** O ponto exato de entrada depende do workflow atual.

### 07 - Respond to Webhook

Em caso de aceite:

```json
{
  "ok": true,
  "message": "Produto enviado para reprocessamento.",
  "sku": "32407",
  "request_id": "..."
}
```

Status HTTP: `200`.

Em caso de erro de SKU:

```json
{
  "ok": false,
  "message": "Produto não encontrado no Shopify para o SKU informado."
}
```

Use HTTP `404` ou `400` conforme o caso.

## Comportamento já implementado no site

O botão agora possui estados:

```text
Reprocessar
→ Enviando...
→ Enviado
```

Em falha:

```text
Tentar novamente
```

O dashboard também mostra um aviso de sucesso/erro no canto da tela.

O backend:

- exige usuário autenticado;
- não expõe o token do n8n ao navegador;
- adiciona `request_id` único;
- informa qual usuário solicitou o reprocessamento;
- possui timeout de 20 segundos;
- repassa uma mensagem legível quando o n8n rejeita a chamada.

## Próximo passo para fechar a integração

Para conectar o node **Execute Workflow** corretamente, precisamos revisar o JSON atual da automação principal de cadastro de produtos e escolher o ponto de entrada do produto reprocessado.
