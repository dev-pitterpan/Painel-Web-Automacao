import { CheckCircle2, RotateCcw } from "lucide-react";
import { getCurrentUser, listReprocesses } from "@/lib/auth";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR");
}

function resultObject(result: Record<string, unknown> | null) {
  if (!result) return null;
  return Array.isArray(result) ? result[0] as Record<string, unknown> | undefined : result;
}

function isYes(value: unknown) {
  return String(value || "").toLowerCase() === "sim";
}

function showValue(value: unknown) {
  const text = String(value || "").trim();
  return text || "—";
}

export default async function ReprocessedPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const records = listReprocesses(user);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Produtos reprocessados</h1>
          <div className="page-sub">Histórico de produtos enviados com sucesso para o n8n.</div>
        </div>
        <div className="metric-note">{records.length} registros</div>
      </div>

      <section className="panel reprocessed-panel">
        {records.length === 0 ? (
          <div className="empty-results" role="status">
            <div className="empty-results-icon"><RotateCcw size={24} /></div>
            <strong>Nenhum produto reprocessado</strong>
            <span>Os produtos enviados pelo botão de reprocessamento aparecerão aqui.</span>
          </div>
        ) : (
          <div className="table-wrap reprocessed-table">
            <table>
              <thead>
                <tr>
                  <th>Solicitado em</th>
                  <th>SKU</th>
                  <th>Produto</th>
                  <th>Data do histórico</th>
                  {user.role === "admin" && <th>Solicitado por</th>}
                  <th>Status</th>
                  <th>O que foi alterado</th>
                  <th>Request ID</th>
                </tr>
              </thead>
              <tbody>
                {records.map(record => (
                  (() => {
                    const result = resultObject(record.result);
                    const changes = [
                      isYes(result?.titulo_alterado) ? `Título: ${showValue(result?.titulo_antes)} -> ${showValue(result?.titulo_depois)}` : null,
                      isYes(result?.tags_alteradas) ? `Tags: ${showValue(result?.tags_antes)} -> ${showValue(result?.tags_depois)}` : null,
                      isYes(result?.colecoes_alteradas) ? `Coleções: ${showValue(result?.colecoes_antes)} -> ${showValue(result?.colecoes_depois)}` : null,
                      isYes(result?.descricao_gerada) ? "Descrição gerada" : null
                    ].filter((change): change is string => Boolean(change));
                    return <tr key={record.id}>
                    <td>{formatDate(record.createdAt)}</td>
                    <td><strong>{record.sku}</strong></td>
                    <td>{record.title || "—"}</td>
                    <td>{record.historicalDate || "—"}</td>
                    {user.role === "admin" && <td>{record.requestedBy}</td>}
                    <td><span className="reprocessed-status"><CheckCircle2 size={13} /> {showValue(result?.status) === "—" ? "Enviado" : showValue(result?.status)}</span></td>
                    <td><div className="reprocessed-changes">{changes.length ? changes.map(change => <span key={change}>{change}</span>) : <span>Nenhuma alteração registrada</span>}</div></td>
                    <td><code className="request-id">{record.requestId}</code></td>
                    </tr>;
                  })()
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
