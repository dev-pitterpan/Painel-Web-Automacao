import { redirect } from "next/navigation";
import { ScrollText } from "lucide-react";
import { getCurrentUser, listAuditLogs } from "@/lib/auth";

export const dynamic = "force-dynamic";

const labels: Record<string, string> = {
  login_success: "Login realizado", login_failed: "Falha de login", logout: "Logout",
  report_exported: "Relatório exportado", reprocess_requested: "Reprocessamento solicitado",
  reprocess_completed: "Reprocessamento concluído", reprocess_failed: "Falha no n8n",
  user_created: "Usuário criado", user_role_changed: "Perfil alterado", user_updated: "Usuário editado", user_deleted: "Usuário excluído", settings_updated: "Configurações alteradas",
};

const eventTones: Record<string, string> = {
  login_success: "success", login_failed: "danger", logout: "neutral",
  report_exported: "blue", reprocess_requested: "warning", reprocess_completed: "success",
  reprocess_failed: "danger", user_created: "cyan", user_role_changed: "violet", user_updated: "violet", user_deleted: "danger", settings_updated: "blue",
};

export default async function AuditPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/");
  const records = listAuditLogs();
  return <><div className="page-head"><div><h1 className="page-title">Auditoria</h1><div className="page-sub">Histórico de acessos, exportações, reprocessamentos e alterações administrativas.</div></div><span className="admin-only-badge"><ScrollText size={15} />{records.length} eventos</span></div><section className="panel audit-panel"><div className="table-wrap audit-table"><table><thead><tr><th>Data e hora</th><th>Usuário</th><th>Evento</th><th>Área</th><th>Detalhes</th></tr></thead><tbody>{records.length ? records.map(record => <tr key={record.id}><td data-label="Data e hora">{new Date(`${record.createdAt}Z`).toLocaleString("pt-BR")}</td><td data-label="Usuário"><b>{record.userName || "Sistema/visitante"}</b><small>{record.userEmail || "—"}</small></td><td data-label="Evento"><span className={`audit-action audit-action-${eventTones[record.action] || "neutral"}`}>{labels[record.action] || record.action}</span></td><td data-label="Área">{record.entity}</td><td data-label="Detalhes"><code className="audit-details">{record.details ? Object.entries(record.details).map(([key, value]) => `${key}: ${String(value)}`).join(" · ") : "—"}</code></td></tr>) : <tr><td colSpan={5} className="empty">Os próximos eventos aparecerão aqui.</td></tr>}</tbody></table></div></section></>;
}
