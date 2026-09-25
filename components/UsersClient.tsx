"use client";

import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Pencil, Save, ShieldCheck, Trash2, UserPlus, Users, X } from "lucide-react";

type ManagedUser = { id: number; name: string; email: string; role: string; createdAt: string };

function formatCreatedAt(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export function UsersClient() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState(0);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", role: "user", password: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/users", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setUsers(body.users || []);
      setCurrentUserId(body.currentUserId || 0);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível carregar os usuários."); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function create(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setForm({ name: "", email: "", password: "" });
      setMessage("Usuário comum criado com sucesso.");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível criar o usuário."); }
    finally { setSaving(false); }
  }

  function openEdit(user: ManagedUser) {
    setError(""); setMessage(""); setEditing(user);
    setEditForm({ name: user.name, email: user.email, role: user.role, password: "" });
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: editing.id, ...editForm }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setEditing(null); setMessage("Usuário atualizado com sucesso.");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível editar o usuário."); }
    finally { setSaving(false); }
  }

  async function removeUser(user: ManagedUser) {
    if (user.id === currentUserId || !window.confirm(`Excluir o usuário ${user.name}? Esta ação não pode ser desfeita.`)) return;
    setDeletingId(user.id); setError(""); setMessage("");
    try {
      const response = await fetch("/api/users", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: user.id }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setMessage("Usuário excluído com sucesso.");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível excluir o usuário."); }
    finally { setDeletingId(null); }
  }

  return <>
    <div className="page-head"><div><h1 className="page-title">Usuários</h1><div className="page-sub">Gerencie acessos e permissões administrativas.</div></div><span className="admin-only-badge"><ShieldCheck size={15} />Área administrativa</span></div>
    {(message || error) && <div className={`users-message ${error ? "is-error" : ""}`}>{error || message}</div>}
    <div className="users-layout">
      <section className="panel users-list">
        <div className="panel-head"><div><div className="eyebrow">Acessos</div><div className="panel-title"><Users size={16} /> Usuários cadastrados</div></div><span className="metric-note">{users.length} conta(s)</span></div>
        {loading ? <div className="empty">Carregando usuários...</div> : <div className="table-wrap users-table"><table><thead><tr><th>Usuário</th><th>E-mail</th><th>Perfil</th><th>Criado em</th><th>Ações</th></tr></thead><tbody>{users.map(user => <tr key={user.id}>
          <td data-label="Usuário"><b>{user.name}</b>{user.id === currentUserId && <small className="current-user">Conta atual</small>}</td>
          <td data-label="E-mail">{user.email}</td>
          <td data-label="Perfil"><span className={`user-role-badge ${user.role === "admin" ? "is-admin" : ""}`}>{user.role === "admin" ? "Administrador" : "Usuário"}</span></td>
          <td data-label="Criado em">{formatCreatedAt(user.createdAt)}</td>
          <td data-label="Ações"><div className="user-actions"><button type="button" className="user-action-btn" onClick={() => openEdit(user)}><Pencil size={14} />Editar</button><button type="button" className="user-action-btn is-danger" disabled={user.id === currentUserId || deletingId === user.id} title={user.id === currentUserId ? "Você não pode excluir sua própria conta." : "Excluir usuário"} onClick={() => removeUser(user)}><Trash2 size={14} />{deletingId === user.id ? "Excluindo..." : "Excluir"}</button></div></td>
        </tr>)}</tbody></table></div>}
      </section>
      <form className="panel user-create" onSubmit={create}><span className="user-create-icon"><UserPlus /></span><h2>Novo usuário</h2><p>Novas contas são sempre criadas como usuário comum. Depois, você pode editar o perfil na tabela.</p><label>Nome<input value={form.name} onChange={e => setForm(value => ({ ...value, name: e.target.value }))} required minLength={2} /></label><label>E-mail<input type="email" value={form.email} onChange={e => setForm(value => ({ ...value, email: e.target.value }))} required /></label><label>Senha temporária<input type="password" value={form.password} onChange={e => setForm(value => ({ ...value, password: e.target.value }))} required minLength={12} /><small>Mínimo de 12 caracteres.</small></label><button className="btn btn-primary" disabled={saving}><CheckCircle2 size={16} />{saving ? "Criando..." : "Criar usuário comum"}</button></form>
    </div>

    {editing && <div className="user-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !saving) setEditing(null); }}>
      <form className="panel user-edit-modal" onSubmit={saveEdit} role="dialog" aria-modal="true" aria-labelledby="edit-user-title">
        <div className="user-edit-head"><div><div className="eyebrow">Gerenciar acesso</div><h2 id="edit-user-title">Editar usuário</h2></div><button type="button" className="user-modal-close" aria-label="Fechar" disabled={saving} onClick={() => setEditing(null)}><X size={19} /></button></div>
        <div className="user-edit-fields">
          <label>Nome<input value={editForm.name} onChange={e => setEditForm(value => ({ ...value, name: e.target.value }))} required minLength={2} /></label>
          <label>E-mail<input type="email" value={editForm.email} onChange={e => setEditForm(value => ({ ...value, email: e.target.value }))} required /></label>
          <label>Perfil<select value={editForm.role} disabled={editing.id === currentUserId} onChange={e => setEditForm(value => ({ ...value, role: e.target.value }))}><option value="user">Usuário</option><option value="admin">Administrador</option></select>{editing.id === currentUserId && <small>Seu próprio perfil não pode ser rebaixado.</small>}</label>
          <label>Nova senha <small>(opcional)</small><input type="password" value={editForm.password} onChange={e => setEditForm(value => ({ ...value, password: e.target.value }))} minLength={12} placeholder="Vazio para não alterar" /></label>
        </div>
        <div className="user-edit-actions"><button type="button" className="btn" disabled={saving} onClick={() => setEditing(null)}>Cancelar</button><button className="btn btn-primary" disabled={saving}><Save size={16} />{saving ? "Salvando..." : "Salvar alterações"}</button></div>
      </form>
    </div>}
  </>;
}
