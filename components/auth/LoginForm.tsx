"use client";

import { FormEvent, useEffect, useState } from "react";
import { Eye, EyeOff, LockKeyhole, Mail, LogIn } from "lucide-react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginComplete, setLoginComplete] = useState(false);
  const [loginProgress, setLoginProgress] = useState(8);

  useEffect(() => {
    if (!loginComplete) return;
    const interval = window.setInterval(
      () => setLoginProgress((value) => Math.min(94, value + 7)),
      90,
    );
    const complete = window.setTimeout(() => {
      setLoginProgress(100);
      window.setTimeout(() => {
        router.replace("/?fromLogin=1");
        router.refresh();
      }, 180);
    }, 1250);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(complete);
    };
  }, [loginComplete, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Não foi possível entrar.");
      setLoginComplete(true);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Não foi possível entrar.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (loginComplete) {
    return (
      <main className="login-welcome-loading" aria-live="polite">
        <div className="login-welcome-progress">
          <div className="login-welcome-progress-track" aria-hidden="true">
            <span style={{ width: `${loginProgress}%` }} />
          </div>
          <strong>{loginProgress}%</strong>
        </div>
      </main>
    );
  }

  return (
    <main className="login-screen">
      <section className="login-card">
        <img
          className="login-logo"
          src="/logo-pitter-com-fundo.png"
          alt="Pitter Pan Festas"
        />
        <div className="login-heading">
          <span>Catálogo Pro</span>
          <h1>Bem-vindo de volta</h1>
          <p>Entre para acompanhar a automação do seu catálogo.</p>
        </div>
        <form className="login-form" onSubmit={submit}>
          <label htmlFor="email">E-mail</label>
          <div className="login-input">
            <Mail size={17} />
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <label htmlFor="password">Senha</label>
          <div className="login-input">
            <LockKeyhole size={17} />
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button
              className="password-toggle"
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              title={showPassword ? "Ocultar senha" : "Mostrar senha"}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}
          <button className="login-submit" type="submit" disabled={loading}>
            <LogIn size={17} />
            {loading ? "Entrando..." : "Entrar no dashboard"}
          </button>
        </form>
      </section>
    </main>
  );
}
