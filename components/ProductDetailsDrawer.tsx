"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Info,
  LoaderCircle,
  Package,
  Pencil,
  Scale,
  X,
} from "lucide-react";
import type { HistoryRow } from "@/lib/types";

type DrawerStep = "details" | "edit" | "review";
type EditForm = {
  title: string;
  tags: string;
  collections: string;
  weight: string;
  weightUnit: "g" | "kg";
};
export type UpdatedProduct = {
  title: string;
  tags: string[];
  collections: string[];
  weight: number;
  weightUnit: "g" | "kg";
};

const currentTitle = (row: HistoryRow) =>
  row.tituloDepois || row.tituloAntes || "";
const currentTags = (row: HistoryRow) => row.tagsDepois || row.tagsAntes || "";
const currentCollections = (row: HistoryRow) =>
  row.colecoesDepois || row.colecoesAntes || "";
const fallbackForm = (row: HistoryRow): EditForm => ({
  title: currentTitle(row),
  tags: currentTags(row),
  collections: currentCollections(row),
  weight: "",
  weightUnit: "g",
});
const listText = (value: unknown) =>
  Array.isArray(value) ? value.map(String).join(", ") : String(value ?? "");

function ValueCard({
  label,
  before,
  after,
  changed,
}: {
  label: string;
  before: string;
  after: string;
  changed: boolean;
}) {
  return (
    <section className="comparison-card">
      <div className="comparison-card-head">
        <strong>{label}</strong>
        <span className={changed ? "change-state is-changed" : "change-state"}>
          {changed ? "Alterado" : "Sem alteração"}
        </span>
      </div>
      <div className="comparison-values">
        <div>
          <small>Antes</small>
          <p>{before || "Não informado"}</p>
        </div>
        <ArrowRight size={16} />
        <div>
          <small>Depois</small>
          <p>{after || "Não informado"}</p>
        </div>
      </div>
    </section>
  );
}

function ReviewRow({
  label,
  before,
  after,
}: {
  label: string;
  before: string;
  after: string;
}) {
  const changed = before.trim() !== after.trim();
  return (
    <div className={`edit-review-row ${changed ? "is-changed" : ""}`}>
      <div className="edit-review-label">
        <strong>{label}</strong>
        <span>{changed ? "Será alterado" : "Sem alteração"}</span>
      </div>
      <div className="edit-review-values">
        <div>
          <small>Atual</small>
          <p>{before || "Não informado"}</p>
        </div>
        <ArrowRight size={15} />
        <div>
          <small>Novo</small>
          <p>{after || "Não informado"}</p>
        </div>
      </div>
    </div>
  );
}

export function ProductDetailsDrawer({
  row,
  onClose,
  onProductUpdated,
}: {
  row: HistoryRow | null;
  onClose: () => void;
  onProductUpdated?: (sku: string, product: UpdatedProduct) => void;
}) {
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [position, setPosition] = useState({ x: 24, y: 72 });
  const dragOffset = useRef({ x: 0, y: 0 });
  const windowRef = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);
  const [step, setStep] = useState<DrawerStep>("details");
  const [form, setForm] = useState<EditForm | null>(null);
  const [original, setOriginal] = useState<EditForm | null>(null);
  const [loadingProduct, setLoadingProduct] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!row) return;
    setHistory((current) => {
      const trimmed =
        historyIndex >= 0 ? current.slice(0, historyIndex + 1) : current;
      const last = trimmed.at(-1);
      if (last?.sku === row.sku)
        return trimmed.map((item, index) =>
          index === trimmed.length - 1 ? row : item,
        );
      const next = [...trimmed, row].slice(-30);
      setHistoryIndex(next.length - 1);
      return next;
    });
  }, [row]);

  const activeRow = historyIndex >= 0 ? history[historyIndex] : row;

  useEffect(() => {
    if (!activeRow) return;
    const initial = fallbackForm(activeRow);
    setStep("details");
    setForm(initial);
    setOriginal(initial);
    setMessage("");
    setError("");
  }, [activeRow]);

  useEffect(() => {
    if (!row) {
      wasOpen.current = false;
      setHistory([]);
      setHistoryIndex(-1);
      return;
    }
    if (wasOpen.current) return;
    wasOpen.current = true;
    const defaultWidth = Math.min(960, window.innerWidth - 32);
    const defaultHeight = Math.min(760, window.innerHeight - 48);
    setPosition({
      x: Math.max(8, Math.round((window.innerWidth - defaultWidth) / 2)),
      y: Math.max(16, Math.round((window.innerHeight - defaultHeight) / 2)),
    });
  }, [row]);

  useEffect(() => {
    if (!row) return;
    const close = (event: KeyboardEvent) =>
      event.key === "Escape" && !saving && onClose();
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [row, onClose, saving]);

  const changedFields = useMemo(() => {
    if (!form || !original) return 0;
    return (
      ["title", "tags", "collections", "weight", "weightUnit"] as const
    ).filter((field) => form[field].trim() !== original[field].trim()).length;
  }, [form, original]);

  if (!row || !activeRow || !form || !original) return null;
  const failed = String(activeRow.status || "")
    .toLowerCase()
    .startsWith("erro");
  const title = currentTitle(activeRow) || "Produto sem título";
  const update = (field: keyof EditForm, value: string) =>
    setForm((current) => (current ? { ...current, [field]: value } : current));

  function startDragging(event: React.PointerEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("button")) return;
    dragOffset.current = {
      x: event.clientX - position.x,
      y: event.clientY - position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function dragWindow(event: React.PointerEvent<HTMLElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const width = windowRef.current?.offsetWidth || 600;
    const next = {
      x: Math.min(
        Math.max(8, event.clientX - dragOffset.current.x),
        Math.max(8, window.innerWidth - width - 8),
      ),
      y: Math.min(
        Math.max(8, event.clientY - dragOffset.current.y),
        Math.max(8, window.innerHeight - 80),
      ),
    };
    setPosition(next);
  }
  function stopDragging(event: React.PointerEvent<HTMLElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  async function openEditor() {
    setLoadingProduct(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/n8n/product-editor?sku=${encodeURIComponent(activeRow!.sku)}`,
        { cache: "no-store" },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(body.error || "Não foi possível carregar o produto.");
      const product = body.product || {};
      const next: EditForm = {
        title: String(product.title ?? currentTitle(activeRow!)),
        tags: listText(product.tags ?? currentTags(activeRow!)),
        collections: listText(
          product.collections ?? currentCollections(activeRow!),
        ),
        weight: String(product.weight ?? ""),
        weightUnit: product.weightUnit === "kg" ? "kg" : "g",
      };
      setForm(next);
      setOriginal(next);
      setStep("edit");
    } catch (cause) {
      const initial = fallbackForm(activeRow!);
      setForm(initial);
      setOriginal(initial);
      setStep("edit");
      setError(
        `${cause instanceof Error ? cause.message : "Falha ao consultar o Shopify."} Você ainda pode visualizar o editor; o envio ficará disponível após configurar o workflow.`,
      );
    } finally {
      setLoadingProduct(false);
    }
  }

  async function saveProduct() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/n8n/product-editor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: activeRow!.sku,
          title: form!.title,
          tags: form!.tags
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          collections: form!.collections
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          weight: Number(form!.weight || 0),
          weightUnit: form!.weightUnit,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(body.error || "Não foi possível atualizar o produto.");
      onProductUpdated?.(activeRow!.sku, body.product);
      setOriginal(form!);
      setMessage(body.message || "Produto atualizado no Shopify com sucesso.");
      setStep("details");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Falha ao atualizar o Shopify.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside
      ref={windowRef}
      className="product-drawer product-editor-drawer product-floating-window"
      role="dialog"
      aria-modal="false"
      aria-labelledby="product-drawer-title"
      style={{ left: position.x, top: position.y }}
    >
      <header
        className="product-drawer-head product-window-bar"
        onPointerDown={startDragging}
        onPointerMove={dragWindow}
        onPointerUp={stopDragging}
      >
        <button
          className="product-window-back"
          type="button"
          disabled={historyIndex <= 0 || saving}
          onClick={() => setHistoryIndex((index) => Math.max(0, index - 1))}
          aria-label="Voltar para o produto anterior"
        >
          <ArrowLeft size={18} />
        </button>
        <button
          className="product-window-forward"
          type="button"
          disabled={
            historyIndex < 0 || historyIndex >= history.length - 1 || saving
          }
          onClick={() =>
            setHistoryIndex((index) => Math.min(history.length - 1, index + 1))
          }
          aria-label="Avançar para o próximo produto"
        >
          <ArrowRight size={18} />
        </button>
        <span className="product-drawer-icon">
          {step === "details" ? <Package size={20} /> : <Pencil size={19} />}
        </span>
        <div className="product-window-title">
          <small>
            {step === "details"
              ? `Produto ${historyIndex + 1} de ${history.length}`
              : step === "edit"
                ? "Editar produto"
                : "Revisar alterações"}
          </small>
          <h2 id="product-drawer-title">{title}</h2>
        </div>
        <button
          className="product-window-close"
          type="button"
          onClick={onClose}
          disabled={saving}
          aria-label="Fechar janela do produto"
          title="Fechar"
        >
          <X size={19} />
        </button>
      </header>
      <div className="product-drawer-meta">
        <span>
          <small>SKU</small>
          <strong>{activeRow.sku || "—"}</strong>
        </span>
        <span>
          <small>Marca</small>
          <strong>{activeRow.marca || "—"}</strong>
        </span>
        <span>
          <small>Última atualização</small>
          <strong>{activeRow.dataHora || "—"}</strong>
        </span>
        <span className={failed ? "drawer-status is-error" : "drawer-status"}>
          {failed ? <CircleAlert size={14} /> : <CheckCircle2 size={14} />}
          {failed ? "Erro" : "Sincronizado"}
        </span>
      </div>
      {(error || message) && (
        <div
          className={`product-editor-message ${error ? "is-error" : "is-success"}`}
        >
          {error ? <CircleAlert size={16} /> : <CheckCircle2 size={16} />}
          <span>{error || message}</span>
          <button
            type="button"
            onClick={() => {
              setError("");
              setMessage("");
            }}
            aria-label="Fechar aviso"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {step === "details" && (
        <>
          <div className="drawer-edit-banner">
            <div>
              <strong>Editar informações no Shopify</strong>
              <span>
                Carregue os valores atuais e altere título, tags, coleções e
                peso.
              </span>
            </div>
            <button
              className="btn btn-primary"
              type="button"
              onClick={openEditor}
              disabled={loadingProduct}
            >
              {loadingProduct ? (
                <LoaderCircle className="spin" size={14} />
              ) : (
                <Pencil size={14} />
              )}
              {loadingProduct ? "Carregando..." : "Editar produto"}
            </button>
          </div>
          <div className="product-drawer-body">
            <ValueCard
              label="Título"
              before={activeRow.tituloAntes}
              after={activeRow.tituloDepois}
              changed={activeRow.tituloAlterado}
            />
            <ValueCard
              label="Tags"
              before={activeRow.tagsAntes}
              after={activeRow.tagsDepois}
              changed={activeRow.tagsAlteradas}
            />
            <ValueCard
              label="Coleções"
              before={activeRow.colecoesAntes}
              after={activeRow.colecoesDepois}
              changed={activeRow.colecoesAlteradas}
            />
            <section className="description-result">
              <div>
                <strong>Descrição do produto</strong>
                <small>
                  O conteúdo atual será carregado diretamente do Shopify ao
                  editar.
                </small>
              </div>
              <span className={activeRow.descricaoGerada ? "is-generated" : ""}>
                {activeRow.descricaoGerada ? "Gerada" : "Não gerada"}
              </span>
            </section>
          </div>
        </>
      )}

      {step === "edit" && (
        <form
          className="product-edit-form"
          onSubmit={(event) => {
            event.preventDefault();
            setStep("review");
          }}
        >
          <div className="editor-phase-notice">
            <Info size={16} />
            <span>
              Os valores abaixo foram consultados no Shopify. A atualização só
              acontece depois da confirmação.
            </span>
          </div>
          <label className="product-edit-field">
            <span>Título</span>
            <input
              value={form.title}
              onChange={(event) => update("title", event.target.value)}
              maxLength={255}
              required
            />
            <small>{form.title.length}/255 caracteres</small>
          </label>
          <label className="product-edit-field">
            <span>Tags</span>
            <textarea
              value={form.tags}
              onChange={(event) => update("tags", event.target.value)}
              rows={3}
              placeholder="Separe as tags por vírgulas"
            />
            <small>Separe cada tag por vírgula.</small>
          </label>
          <label className="product-edit-field">
            <span>Coleções</span>
            <textarea
              value={form.collections}
              onChange={(event) => update("collections", event.target.value)}
              rows={3}
              placeholder="Separe as coleções por vírgulas"
            />
            <small>Use os nomes exatos das coleções existentes.</small>
          </label>
          <div className="product-edit-field">
            <span>Peso</span>
            <div className="weight-field">
              <Scale size={17} />
              <input
                type="number"
                min="0"
                step="0.001"
                value={form.weight}
                onChange={(event) => update("weight", event.target.value)}
                placeholder="0"
                required
              />
              <select
                value={form.weightUnit}
                onChange={(event) => update("weightUnit", event.target.value)}
              >
                <option value="g">g</option>
                <option value="kg">kg</option>
              </select>
            </div>
          </div>
          <footer className="product-editor-actions">
            <button
              className="btn"
              type="button"
              onClick={() => {
                setForm(original);
                setStep("details");
              }}
            >
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={!changedFields}
            >
              Revisar alterações <ArrowRight size={15} />
            </button>
          </footer>
        </form>
      )}

      {step === "review" && (
        <div className="product-review">
          <div className="review-summary">
            <strong>
              {changedFields}{" "}
              {changedFields === 1 ? "campo alterado" : "campos alterados"}
            </strong>
            <span>Confira os valores antes de enviar.</span>
          </div>
          <ReviewRow
            label="Título"
            before={original.title}
            after={form.title}
          />
          <ReviewRow label="Tags" before={original.tags} after={form.tags} />
          <ReviewRow
            label="Coleções"
            before={original.collections}
            after={form.collections}
          />
          <ReviewRow
            label="Peso"
            before={
              original.weight ? `${original.weight} ${original.weightUnit}` : ""
            }
            after={form.weight ? `${form.weight} ${form.weightUnit}` : ""}
          />
          <div className="shopify-integration-pending">
            <Info size={17} />
            <div>
              <strong>Atualização segura via n8n</strong>
              <span>
                Ao confirmar, o n8n validará o produto pelo SKU e aplicará as
                mudanças no Shopify.
              </span>
            </div>
          </div>
          <footer className="product-editor-actions">
            <button
              className="btn"
              type="button"
              disabled={saving}
              onClick={() => setStep("edit")}
            >
              <ArrowLeft size={15} /> Voltar e editar
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={saving || !changedFields}
              onClick={saveProduct}
            >
              {saving && <LoaderCircle className="spin" size={14} />}
              {saving ? "Atualizando..." : "Atualizar no Shopify"}
            </button>
          </footer>
        </div>
      )}
    </aside>
  );
}
