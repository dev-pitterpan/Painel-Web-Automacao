"use client";

import { Check, Clock3, Cog, Info, Monitor, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useAutomationProgress } from "@/components/AutomationProgressProvider";

const CHECK_INTERVAL_MS = 60_000;
const REMIND_LATER_MS = 15 * 60_000;
const DISMISS_KEY = "pitter-system-update-dismissed";
const COMPLETED_KEY = "pitter-system-update-completed";

type AvailableVersion = {
  version: string;
  label: string;
};

type CompletedUpdate = {
  previousLabel: string;
  currentLabel: string;
  targetVersion: string;
};

export function SystemUpdateProvider({
  currentVersion,
  currentLabel,
  children,
}: {
  currentVersion: string;
  currentLabel: string;
  children: ReactNode;
}) {
  const { isUpdateBlocked, isAutomationActive } = useAutomationProgress();
  const [available, setAvailable] = useState<AvailableVersion | null>(null);
  const [dismissedUntil, setDismissedUntil] = useState(0);
  const [completedUpdate, setCompletedUpdate] =
    useState<CompletedUpdate | null>(null);

  const checkVersion = useCallback(async () => {
    try {
      const response = await fetch(`/api/version?t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      const result = await response.json().catch(() => null);
      const latestVersion = String(result?.version || "").trim();
      if (!response.ok || !latestVersion || latestVersion === currentVersion)
        return;
      try {
        const dismissed = JSON.parse(
          sessionStorage.getItem(DISMISS_KEY) || "null",
        );
        if (dismissed?.version && dismissed.version !== latestVersion)
          setDismissedUntil(0);
      } catch {
        sessionStorage.removeItem(DISMISS_KEY);
      }
      setAvailable({
        version: latestVersion,
        label: String(result?.label || `Build ${latestVersion.slice(0, 7)}`),
      });
    } catch {
      // A próxima verificação tenta novamente sem interromper o painel.
    }
  }, [currentVersion]);

  useEffect(() => {
    try {
      const completed = JSON.parse(
        sessionStorage.getItem(COMPLETED_KEY) || "null",
      ) as CompletedUpdate | null;
      if (completed?.targetVersion === currentVersion) {
        setCompletedUpdate(completed);
      }
      sessionStorage.removeItem(COMPLETED_KEY);
    } catch {
      sessionStorage.removeItem(COMPLETED_KEY);
    }

    try {
      const stored = JSON.parse(sessionStorage.getItem(DISMISS_KEY) || "null");
      if (stored && Number(stored.until) > Date.now())
        setDismissedUntil(Number(stored.until));
    } catch {
      sessionStorage.removeItem(DISMISS_KEY);
    }

    void checkVersion();
    const interval = window.setInterval(checkVersion, CHECK_INTERVAL_MS);
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") void checkVersion();
    };
    document.addEventListener("visibilitychange", checkWhenVisible);
    window.addEventListener("focus", checkVersion);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", checkWhenVisible);
      window.removeEventListener("focus", checkVersion);
    };
  }, [checkVersion]);

  const remindLater = () => {
    const until = Date.now() + REMIND_LATER_MS;
    setDismissedUntil(until);
    if (available)
      sessionStorage.setItem(
        DISMISS_KEY,
        JSON.stringify({ version: available.version, until }),
      );
  };

  const applyUpdate = () => {
    if (!available) return;
    sessionStorage.setItem(
      COMPLETED_KEY,
      JSON.stringify({
        previousLabel: currentLabel,
        currentLabel: available.label,
        targetVersion: available.version,
      } satisfies CompletedUpdate),
    );
    window.location.reload();
  };

  const visible =
    Boolean(available) && !isUpdateBlocked && Date.now() >= dismissedUntil;

  return (
    <>
      {children}
      {completedUpdate && (
        <div className="system-update-backdrop" role="presentation">
          <section
            className="system-update-modal system-update-complete"
            role="dialog"
            aria-modal="true"
            aria-labelledby="system-update-complete-title"
          >
            <button
              className="system-update-close"
              type="button"
              onClick={() => setCompletedUpdate(null)}
              aria-label="Fechar confirmação"
            >
              <X />
            </button>
            <div className="system-update-wave" aria-hidden="true" />
            <div className="system-update-hero" aria-hidden="true">
              <span className="system-update-ray ray-one" />
              <span className="system-update-ray ray-two" />
              <span className="system-update-ray ray-three is-green" />
              <span className="system-update-ray ray-four is-green" />
              <div className="system-update-hero-icon">
                <RefreshCw />
                <span className="system-update-hero-check">
                  <Check />
                </span>
              </div>
            </div>

            <div className="system-update-content">
              <div className="system-update-badge is-success">
                <i /> Atualização concluída
              </div>
              <h2 id="system-update-complete-title">
                Sistema atualizado com sucesso
              </h2>
              <p className="system-update-description">
                A nova versão já foi aplicada. Seu painel foi recarregado e
                agora está pronto para uso.
              </p>

              <div className="system-update-versions">
                <div>
                  <Monitor />
                  <span>Versão anterior:</span>
                  <strong>{completedUpdate.previousLabel}</strong>
                </div>
                <div>
                  <span className="system-update-cog">
                    <Cog />
                  </span>
                  <span>Versão atual:</span>
                  <strong>{completedUpdate.currentLabel}</strong>
                </div>
                <div>
                  <span className="system-update-complete-icon">
                    <Check />
                  </span>
                  <span>Status:</span>
                  <strong className="system-update-status is-success">
                    <i /> atualizado e sincronizado
                  </strong>
                </div>
              </div>

              <div className="system-update-notice">
                <Info />
                Todas as máquinas conectadas já podem continuar usando a versão
                mais recente.
              </div>

              <div className="system-update-actions is-complete">
                <button
                  className="is-primary"
                  type="button"
                  onClick={() => setCompletedUpdate(null)}
                >
                  Continuar
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
      {!completedUpdate && visible && available && (
        <div className="system-update-backdrop" role="presentation">
          <section
            className="system-update-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="system-update-title"
          >
            <button
              className="system-update-close"
              type="button"
              onClick={remindLater}
              aria-label="Lembrar mais tarde"
            >
              <X />
            </button>
            <div className="system-update-wave" aria-hidden="true" />
            <div className="system-update-hero" aria-hidden="true">
              <span className="system-update-ray ray-one" />
              <span className="system-update-ray ray-two" />
              <span className="system-update-ray ray-three" />
              <span className="system-update-ray ray-four" />
              <div className="system-update-hero-icon">
                <RefreshCw />
              </div>
            </div>

            <div className="system-update-content">
              <div className="system-update-badge">
                <i /> Atualização disponível
              </div>
              <h2 id="system-update-title">
                Nova versão do sistema pronta
                <br /> para atualizar
              </h2>
              <p className="system-update-description">
                Uma nova versão do painel foi publicada. Seu sistema está
                desatualizado e precisa recarregar a página para aplicar a
                atualização.
              </p>

              <div className="system-update-versions">
                <div>
                  <Monitor />
                  <span>Versão atual:</span>
                  <strong>{currentLabel}</strong>
                </div>
                <div>
                  <span className="system-update-cog">
                    <Cog />
                  </span>
                  <span>Nova versão:</span>
                  <strong>{available.label}</strong>
                </div>
                <div>
                  <Clock3 />
                  <span>Status:</span>
                  <strong className="system-update-status">
                    <i /> aguardando atualização
                  </strong>
                </div>
              </div>

              <div className="system-update-notice">
                <Info />
                Este aviso foi enviado automaticamente para todas as máquinas
                conectadas.
              </div>

              {isAutomationActive && (
                <div className="system-update-automation-warning">
                  A automação continuará sendo processada pelo n8n. O
                  acompanhamento local será recarregado.
                </div>
              )}

              <div className="system-update-actions">
                <button type="button" onClick={remindLater}>
                  Agora não
                </button>
                <button
                  className="is-primary"
                  type="button"
                  onClick={applyUpdate}
                >
                  <RefreshCw /> Atualizar sistema
                </button>
              </div>
              <small className="system-update-footnote">
                Ao atualizar, a página será recarregada automaticamente.
              </small>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
