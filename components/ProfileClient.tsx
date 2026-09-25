"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, EyeOff, KeyRound, Mail, ShieldCheck, UserRound } from "lucide-react";
import type { AuthUser } from "@/lib/auth";

export function ProfileClient({ user }: { user: AuthUser }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: user.name, email: user.email, currentPassword: "", newPassword: "", confirmPassword: "" });
  const [showPasswords, setShowPasswords] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    if (form.newPassword !== form.confirmPassword) {
      setError("A confirmação não corresponde à nova senha.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, email: form.email, currentPassword: form.currentPassword, newPassword: form.newPassword }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível atualizar o perfil.");
      setForm(value => ({ ...value, name: body.user.name, email: body.user.email, currentPassword: "", newPassword: "", confirmPassword: "" }));
      setMessage("Perfil atualizado com sucesso.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível atualizar o perfil.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <div className="page-head profile-page-head">
      <div><h1 className="page-title">Meu perfil</h1><div className="page-sub">Atualize seus dados pessoais e sua senha de acesso.</div></div>
      <span className="profile-role"><ShieldCheck size={15} />{user.role === "admin" ? "Administrador" : "Usuário"}</span>
    </div>

    <div className="profile-layout">
      <section className="panel profile-summary">
        <span className="profile-avatar">{form.name.slice(0, 2).toUpperCase()}</span>
        <h2>{form.name}</h2>
        <p>{form.email}</p>
        <div className="profile-security-note"><ShieldCheck size={18} /><span><strong>Seus dados estão protegidos</strong><small>Confirme sua senha atual antes de salvar qualquer alteração.</small></span></div>
      </section>

      <form className="panel profile-form" onSubmit={save}>
        <div className="panel-head"><div><div className="eyebrow">Dados da conta</div><div className="panel-title"><UserRound size={16} /> Personalização do perfil</div></div></div>
        {(message || error) && <div className={`users-message ${error ? "is-error" : ""}`} role="status">{error || message}</div>}
        <div className="profile-fields">
          <label><span><UserRound size={14} /> Nome</span><input value={form.name} onChange={event => setForm(value => ({ ...value, name: event.target.value }))} minLength={2} maxLength={100} autoComplete="name" required /></label>
          <label><span><Mail size={14} /> E-mail</span><input type="email" value={form.email} onChange={event => setForm(value => ({ ...value, email: event.target.value }))} maxLength={254} autoComplete="email" required /></label>
        </div>
        <div className="profile-password-head"><KeyRound size={17} /><div><strong>Segurança</strong><small>Deixe a nova senha vazia se quiser manter a senha atual.</small></div></div>
        <div className="profile-fields profile-password-fields">
          <label><span>Senha atual</span><input type={showPasswords ? "text" : "password"} value={form.currentPassword} onChange={event => setForm(value => ({ ...value, currentPassword: event.target.value }))} autoComplete="current-password" required /></label>
          <label><span>Nova senha <small>(opcional)</small></span><input type={showPasswords ? "text" : "password"} value={form.newPassword} onChange={event => setForm(value => ({ ...value, newPassword: event.target.value }))} minLength={form.newPassword ? 12 : undefined} maxLength={256} autoComplete="new-password" placeholder="Mínimo de 12 caracteres" /></label>
          <label><span>Confirmar nova senha</span><input type={showPasswords ? "text" : "password"} value={form.confirmPassword} onChange={event => setForm(value => ({ ...value, confirmPassword: event.target.value }))} minLength={form.confirmPassword ? 12 : undefined} maxLength={256} autoComplete="new-password" disabled={!form.newPassword} /></label>
        </div>
        <button className="profile-show-password" type="button" aria-pressed={showPasswords} onClick={() => setShowPasswords(value => !value)}>{showPasswords ? <EyeOff size={14} /> : <Eye size={14} />}{showPasswords ? "Ocultar senhas" : "Mostrar senhas"}</button>
        <div className="profile-actions"><button className="btn btn-primary" type="submit" disabled={saving}><CheckCircle2 size={16} />{saving ? "Salvando..." : "Salvar alterações"}</button></div>
      </form>
    </div>
  </>;
}
