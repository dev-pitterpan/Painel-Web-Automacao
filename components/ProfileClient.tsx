"use client";

import { ChangeEvent, FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  CalendarDays,
  Camera,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import type { AuthUser } from "@/lib/auth";

export function ProfileClient({ user }: { user: AuthUser }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: user.name,
    email: user.email,
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showPasswords, setShowPasswords] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatarUrl);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function chooseAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Selecione uma imagem válida.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("A imagem deve ter no máximo 8 MB.");
      return;
    }

    const source = URL.createObjectURL(file);
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Imagem inválida."));
        image.src = source;
      });
      const size = Math.min(image.naturalWidth, image.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Não foi possível processar a imagem.");
      context.drawImage(
        image,
        (image.naturalWidth - size) / 2,
        (image.naturalHeight - size) / 2,
        size,
        size,
        0,
        0,
        512,
        512,
      );
      setAvatarUrl(canvas.toDataURL("image/jpeg", 0.82));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Imagem inválida.");
    } finally {
      URL.revokeObjectURL(source);
    }
  }

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
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
          avatarUrl,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Não foi possível atualizar o perfil.");
      setForm((value) => ({
        ...value,
        name: body.user.name,
        email: body.user.email,
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      }));
      setMessage("Perfil atualizado com sucesso.");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível atualizar o perfil.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-head profile-page-head">
        <div>
          <h1 className="page-title">Meu perfil</h1>
          <div className="page-sub">
            Atualize seus dados pessoais e sua senha de acesso.
          </div>
        </div>
        <span className="profile-role">
          <ShieldCheck size={15} />
          {user.role === "admin" ? "Administrador" : "Usuário"}
        </span>
      </div>

      <div className="profile-layout">
        <section className="panel profile-summary">
          <div className="profile-avatar-wrap">
            <span className={`profile-avatar ${avatarUrl ? "has-image" : ""}`}>
              {avatarUrl ? (
                <img src={avatarUrl} alt={`Foto de ${form.name}`} />
              ) : (
                form.name.slice(0, 2).toUpperCase()
              )}
            </span>
            <button
              className="profile-avatar-edit"
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              aria-label="Alterar foto de perfil"
              title="Alterar foto de perfil"
            >
              <Camera size={15} />
            </button>
            <input
              ref={avatarInputRef}
              className="profile-avatar-input"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={chooseAvatar}
            />
          </div>
          <h2>{form.name}</h2>
          <p>{form.email}</p>
          <div className="profile-security-note">
            <ShieldCheck size={18} />
            <span>
              <strong>Seus dados estão protegidos</strong>
              <small>
                Confirme sua senha atual antes de salvar qualquer alteração.
              </small>
            </span>
          </div>
          <div className="profile-account-meta">
            <div>
              <UserRound size={15} />
              <span>Perfil</span>
              <strong>
                {user.role === "admin" ? "Administrador" : "Usuário"}
              </strong>
            </div>
            <div>
              <CalendarDays size={15} />
              <span>Membro desde</span>
              <strong>
                {new Intl.DateTimeFormat("pt-BR").format(
                  new Date(user.createdAt),
                )}
              </strong>
            </div>
          </div>
        </section>

        <form className="panel profile-form" onSubmit={save}>
          <div className="panel-head">
            <div>
              <div className="eyebrow">Dados da conta</div>
              <div className="panel-title">
                <UserRound size={16} /> Personalização do perfil
              </div>
            </div>
          </div>
          {(message || error) && (
            <div
              className={`users-message ${error ? "is-error" : ""}`}
              role="status"
            >
              {error || message}
            </div>
          )}
          <div className="profile-fields">
            <label>
              <span>
                <UserRound size={14} /> Nome
              </span>
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((value) => ({ ...value, name: event.target.value }))
                }
                minLength={2}
                maxLength={100}
                autoComplete="name"
                required
              />
            </label>
            <label>
              <span>
                <Mail size={14} /> E-mail
              </span>
              <input
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((value) => ({ ...value, email: event.target.value }))
                }
                maxLength={254}
                autoComplete="email"
                required
              />
            </label>
          </div>
          <div className="profile-password-head">
            <KeyRound size={17} />
            <div>
              <strong>Segurança</strong>
              <small>
                Deixe a nova senha vazia se quiser manter a senha atual.
              </small>
            </div>
          </div>
          <div className="profile-fields profile-password-fields">
            <label>
              <span>Senha atual</span>
              <input
                type={showPasswords ? "text" : "password"}
                value={form.currentPassword}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    currentPassword: event.target.value,
                  }))
                }
                autoComplete="current-password"
                required
              />
            </label>
            <label>
              <span>
                Nova senha <small>(opcional)</small>
              </span>
              <input
                type={showPasswords ? "text" : "password"}
                value={form.newPassword}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    newPassword: event.target.value,
                  }))
                }
                minLength={form.newPassword ? 12 : undefined}
                maxLength={256}
                autoComplete="new-password"
                placeholder="Mínimo de 12 caracteres"
              />
            </label>
            <label>
              <span>Confirmar nova senha</span>
              <input
                type={showPasswords ? "text" : "password"}
                value={form.confirmPassword}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    confirmPassword: event.target.value,
                  }))
                }
                minLength={form.confirmPassword ? 12 : undefined}
                maxLength={256}
                autoComplete="new-password"
                disabled={!form.newPassword}
              />
            </label>
          </div>
          <button
            className="profile-show-password"
            type="button"
            aria-pressed={showPasswords}
            onClick={() => setShowPasswords((value) => !value)}
          >
            {showPasswords ? <EyeOff size={14} /> : <Eye size={14} />}
            {showPasswords ? "Ocultar senhas" : "Mostrar senhas"}
          </button>
          <div className="profile-actions">
            <button className="btn btn-primary" type="submit" disabled={saving}>
              <CheckCircle2 size={16} />
              {saving ? "Salvando..." : "Salvar alterações"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
