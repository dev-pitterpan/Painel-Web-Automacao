"use client";

import { useState } from "react";
import { Clock3, Gauge, Save, Settings2, ShieldCheck } from "lucide-react";
import type { AppSettings } from "@/lib/auth";

export function SettingsClient({
  initialSettings,
}: {
  initialSettings: AppSettings;
}) {
  const [values, setValues] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const update = (key: keyof AppSettings, value: string) =>
    setValues((current) => ({ ...current, [key]: Number(value) }));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Não foi possível salvar.");
      setValues(body);
      setMessage(
        "Configurações salvas. Os próximos cálculos já usarão estes valores.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha inesperada.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Configurações</h1>
          <div className="page-sub">
            Parâmetros operacionais usados nos cálculos e alertas do sistema.
          </div>
        </div>
        <span className="admin-only-badge">
          <ShieldCheck size={15} />
          Somente ADM
        </span>
      </div>
      {message && <div className="settings-message">{message}</div>}
      {error && <div className="settings-message is-error">{error}</div>}
      <form className="settings-grid" onSubmit={save}>
        <section className="panel settings-card">
          <div className="settings-card-head">
            <Clock3 />
            <div>
              <h2>Tempo economizado</h2>
              <p>
                Defina como o trabalho manual e automatizado são comparados.
              </p>
            </div>
          </div>
          <div className="settings-fields">
            <label>
              Tempo manual por produto{" "}
              <span>
                <input
                  type="number"
                  min="1"
                  max="3600"
                  value={values.manualSecondsPerProduct}
                  onChange={(e) =>
                    update("manualSecondsPerProduct", e.target.value)
                  }
                />{" "}
                segundos
              </span>
            </label>
            <label>
              Produtos por lote{" "}
              <span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={values.batchSize}
                  onChange={(e) => update("batchSize", e.target.value)}
                />{" "}
                produtos
              </span>
            </label>
            <label>
              Tempo por lote automatizado{" "}
              <span>
                <input
                  type="number"
                  min="1"
                  max="3600"
                  value={values.batchSeconds}
                  onChange={(e) => update("batchSeconds", e.target.value)}
                />{" "}
                segundos
              </span>
            </label>
          </div>
        </section>
        <section className="panel settings-card">
          <div className="settings-card-head">
            <Gauge />
            <div>
              <h2>Qualidade e integrações</h2>
              <p>
                Configure as metas e quando uma sincronização deve exigir
                atenção.
              </p>
            </div>
          </div>
          <div className="settings-fields">
            <label>
              Meta de qualidade{" "}
              <span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={values.qualityTarget}
                  onChange={(e) => update("qualityTarget", e.target.value)}
                />{" "}
                %
              </span>
            </label>
            <label>
              Alerta de sincronização{" "}
              <span>
                <input
                  type="number"
                  min="1"
                  max="1440"
                  value={values.staleSyncMinutes}
                  onChange={(e) => update("staleSyncMinutes", e.target.value)}
                />{" "}
                minutos
              </span>
            </label>
          </div>
        </section>
        <section className="panel settings-summary">
          <Settings2 size={19} />
          <div>
            <strong>Configuração centralizada</strong>
            <p>
              As alterações ficam salvas no servidor e valem para todos os
              usuários.
            </p>
          </div>
          <button className="btn btn-primary" disabled={saving}>
            <Save size={16} />
            {saving ? "Salvando..." : "Salvar configurações"}
          </button>
        </section>
      </form>
    </>
  );
}
