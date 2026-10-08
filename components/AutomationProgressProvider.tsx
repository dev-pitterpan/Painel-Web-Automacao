"use client";

import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clock3,
  Cog,
  Ellipsis,
  RefreshCw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type AutomationProgressContextValue = {
  start: (total: number) => void;
  queueReady: (accepted: number, failed: number) => void;
  productFinished: (success: boolean) => void;
};

type AutomationProgressState = {
  total: number;
  successes: number;
  errors: number;
  reading: boolean;
  open: boolean;
  minimized: boolean;
};

const AutomationProgressContext =
  createContext<AutomationProgressContextValue | null>(null);

const INITIAL_STATE: AutomationProgressState = {
  total: 0,
  successes: 0,
  errors: 0,
  reading: false,
  open: false,
  minimized: false,
};

export function AutomationProgressProvider({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const [state, setState] = useState(INITIAL_STATE);

  const start = (total: number) =>
    setState({
      total: Math.max(1, total),
      successes: 0,
      errors: 0,
      reading: true,
      open: true,
      minimized: false,
    });

  const queueReady = (_accepted: number, failed: number) =>
    setState((current) => ({
      ...current,
      errors: Math.max(0, failed),
      reading: false,
    }));

  const productFinished = (success: boolean) =>
    setState((current) => ({
      ...current,
      successes: current.successes + (success ? 1 : 0),
      errors: current.errors + (success ? 0 : 1),
    }));

  const completed = state.successes + state.errors;
  const pending = Math.max(0, state.total - state.successes - state.errors);
  const processing = state.reading ? 0 : Math.min(5, pending);
  const waiting = state.reading
    ? Math.max(0, state.total - state.successes - state.errors)
    : Math.max(0, pending - processing);
  const done = !state.reading && completed >= state.total;
  const percentage = state.total
    ? Math.min(100, Math.round((completed / state.total) * 100))
    : 0;

  const context = useMemo(() => ({ start, queueReady, productFinished }), []);

  return (
    <AutomationProgressContext.Provider value={context}>
      {children}

      {state.open && !state.minimized && (
        <div className="automation-progress-backdrop" role="presentation">
          <section
            className={`automation-progress-modal${done ? " is-complete" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="automation-progress-title"
          >
            <div className="automation-progress-wave" aria-hidden="true" />
            <div className="automation-progress-hero" aria-hidden="true">
              <span className="automation-progress-ray ray-one" />
              <span className="automation-progress-ray ray-two" />
              <span className="automation-progress-ray ray-three" />
              <span className="automation-progress-ray ray-four" />
              <div className="automation-progress-hero-icon">
                {done ? (
                  <span className="automation-progress-check">
                    <Check />
                  </span>
                ) : (
                  <span className="automation-progress-cogs">
                    <Cog className="cog-main" />
                    <Cog className="cog-small" />
                  </span>
                )}
              </div>
            </div>

            <div className="automation-progress-content">
              <div className="automation-progress-eyebrow">AUTOMAÇÃO n8n</div>
              <h2 id="automation-progress-title">
                {done ? "Processamento concluído" : "Processando produtos"}
              </h2>
              <p className="automation-progress-subtitle">
                {completed} de {state.total} concluídos
              </p>

              <div className="automation-progress-bar-row">
                <div
                  className="automation-progress-bar"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percentage}
                >
                  <span style={{ width: `${percentage}%` }} />
                </div>
                <strong>{percentage}%</strong>
              </div>

              <div className="automation-progress-stats">
                <ProgressStat
                  tone="blue"
                  icon={<RefreshCw />}
                  value={processing}
                  label="processando"
                />
                <ProgressStat
                  tone="amber"
                  icon={<Clock3 />}
                  value={waiting}
                  label="aguardando"
                />
                <ProgressStat
                  tone="green"
                  icon={<Check />}
                  value={state.successes}
                  label="sucessos"
                />
                <ProgressStat
                  tone="red"
                  icon={<AlertTriangle />}
                  value={state.errors}
                  label={state.errors === 1 ? "erro" : "erros"}
                />
              </div>

              <div
                className={`automation-progress-steps${done ? " is-complete" : ""}`}
              >
                <ProgressStep
                  state={state.reading ? "active" : "complete"}
                  icon={state.reading ? undefined : <Check />}
                  label="Lendo dados"
                  detail={state.reading ? "Em andamento" : "Concluído"}
                />
                <ProgressStep
                  state={
                    state.reading ? "pending" : done ? "complete" : "active"
                  }
                  icon={done ? <Check /> : undefined}
                  label="Processando automação"
                  detail={done ? "Concluído" : "Em andamento"}
                />
                <ProgressStep
                  state={done ? "complete" : "pending"}
                  icon={done ? <Check /> : <Ellipsis />}
                  label="Enviado ao catálogo"
                  detail={done ? "Concluído" : "Pendente"}
                />
              </div>

              <div className="automation-progress-actions">
                <button
                  type="button"
                  className="automation-progress-secondary"
                  onClick={() =>
                    done
                      ? setState(INITIAL_STATE)
                      : setState((current) => ({ ...current, minimized: true }))
                  }
                >
                  {done ? "Fechar" : "Minimizar"}
                </button>
                <button
                  type="button"
                  className="automation-progress-primary"
                  onClick={() => {
                    setState((current) => ({ ...current, minimized: true }));
                    router.push(done ? "/relatorios" : "/n8n");
                  }}
                >
                  {done ? "Ver relatório" : "Acompanhar"}
                  <ArrowRight />
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {state.open && state.minimized && (
        <button
          type="button"
          className={`automation-progress-mini${done ? " is-complete" : ""}`}
          onClick={() =>
            setState((current) => ({ ...current, minimized: false }))
          }
          aria-label="Abrir acompanhamento da automação"
        >
          <span>{done ? <Check /> : <RefreshCw />}</span>
          <span>
            <strong>
              {done ? "Processamento concluído" : "Processando produtos"}
            </strong>
            <small>
              {completed} de {state.total} concluídos
            </small>
          </span>
          <b>{percentage}%</b>
        </button>
      )}
    </AutomationProgressContext.Provider>
  );
}

function ProgressStat({
  tone,
  icon,
  value,
  label,
}: {
  tone: "blue" | "amber" | "green" | "red";
  icon: ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div className={`automation-progress-stat is-${tone}`}>
      <span>{icon}</span>
      <strong>{value}</strong>
      <small>{label}</small>
    </div>
  );
}

function ProgressStep({
  state,
  icon,
  label,
  detail,
}: {
  state: "complete" | "active" | "pending";
  icon?: ReactNode;
  label: string;
  detail: string;
}) {
  return (
    <div className={`automation-progress-step is-${state}`}>
      <span className="automation-progress-step-icon">{icon}</span>
      <strong>{label}</strong>
      <small>{detail}</small>
    </div>
  );
}

export function useAutomationProgress() {
  const context = useContext(AutomationProgressContext);
  if (!context)
    throw new Error(
      "useAutomationProgress deve ser usado dentro de AutomationProgressProvider.",
    );
  return context;
}
