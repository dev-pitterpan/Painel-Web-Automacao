"use client";

import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, ShieldCheck, UserPlus, Users } from "lucide-react";

type ManagedUser = { id: number; name: string; email: string; role: string; createdAt: string };

export function UsersClient() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState(0);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    try { const response = await fetch("/api/users", { cache: "no-store" }); const body = await response.json(); if (!response.ok) throw new Error(body.error); setUsers(body.users || []); setCurrentUserId(body.currentUserId || 0); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível carregar os usuários."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function create(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    try { const response = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); const body = await response.json(); if (!response.ok) throw new Error(body.error); setForm({ name: "", email: "", password: "" }); setMessage("Usuário comum criado com sucesso."); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível criar o usuário."); }
    finally { setSaving(false); }
  }

  async function changeRole(userId: number, role: string) {
    setError(""); setMessage("");
    const response = await fetch("/api/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, role }) });
    const body = await response.json();
    if (!response.ok) { setError(body.error || "Não foi possível alterar o perfil."); return; }
    setMessage("Perfil atualizado com sucesso."); await load();
  }

  return <>
    <div className="page-head"><div><h1 className="page-title">Usuários</h1><div className="page-sub">Gerencie acessos e permissões administrativas.</div></div><span className="admin-only-badge"><ShieldCheck size={15} />Área administrativa</span></div>
    {(message || error) && <div className={`users-message ${error ? "is-error" : ""}`}>{error || message}</div>}
    <div className="users-layout">
      <section className="panel users-list"><div className="panel-head"><div><div className="eyebrow">Acessos</div><div className="panel-title"><Users size={16} /> Usuários cadastrados</div></div><span className="metric-note">{users.length} conta(s)</span></div>
        {loading ? <div className="empty">Carregando usuários...</div> : <div className="table-wrap users-table"><table><thead><tr><th>Usuário</th><th>E-mail</th><th>Perfil</th><th>Criado em</th></tr></thead><tbody>{users.map(user => <tr key={user.id}><td data-label="Usuário"><b>{user.name}</b>{user.id === currentUserId && <small className="current-user">Conta atual</small>}</td><td data-label="E-mail">{user.email}</td><td data-label="Perfil"><select className="role-select" value={user.role} disabled={user.id === currentUserId} onChange={event => changeRole(user.id, event.target.value)}><option value="user">Usuário</option><option value="admin">Administrador</option></select></td><td data-label="Criado em">{new Date(`${user.createdAt}Z`).toLocaleString("pt-BR")}</td></tr>)}</tbody></table></div>}
      </section>
      <form className="panel user-create" onSubmit={create}><span className="user-create-icon"><UserPlus /></span><h2>Novo usuário</h2><p>Novas contas são sempre criadas como usuário comum. Depois, você pode promovê-las na tabela.</p><label>Nome<input value={form.name} onChange={e => setForm(value => ({ ...value, name: e.target.value }))} required minLength={2} /></label><label>E-mail<input type="email" value={form.email} onChange={e => setForm(value => ({ ...value, email: e.target.value }))} required /></label><label>Senha temporária<input type="password" value={form.password} onChange={e => setForm(value => ({ ...value, password: e.target.value }))} required minLength={12} /><small>Mínimo de 12 caracteres.</small></label><button className="btn btn-primary" disabled={saving}><CheckCircle2 size={16} />{saving ? "Criando..." : "Criar usuário comum"}</button></form>
    </div>
  </>;
}
