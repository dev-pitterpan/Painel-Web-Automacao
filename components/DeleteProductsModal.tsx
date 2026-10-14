"use client";

import { AlertTriangle, LoaderCircle, Trash2, X } from "lucide-react";

type Props = {
  open: boolean;
  count: number;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeleteProductsModal({
  open,
  count,
  busy = false,
  onCancel,
  onConfirm,
}: Props) {
  if (!open) return null;
  const plural = count === 1 ? "produto" : "produtos";

  return (
    <div
      className="delete-products-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-products-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section className="delete-products-modal">
        <button
          className="delete-products-close"
          type="button"
          onClick={onCancel}
          disabled={busy}
          aria-label="Fechar confirmação"
        >
          <X size={20} />
        </button>
        <div className="delete-products-icon" aria-hidden="true">
          <Trash2 size={34} />
        </div>
        <span className="delete-products-kicker">
          <AlertTriangle size={15} /> Ação permanente
        </span>
        <h2 id="delete-products-title">
          Excluir {count} {plural}?
        </h2>
        <p>
          {count === 1
            ? "O produto selecionado será"
            : "Os produtos selecionados serão"}{" "}
          excluído{count === 1 ? "" : "s"} permanentemente da Shopify. Essa ação
          não pode ser desfeita.
        </p>
        <div className="delete-products-summary">
          <Trash2 size={18} />
          <span>
            {count} {plural} selecionado{count === 1 ? "" : "s"}
          </span>
        </div>
        <footer>
          <button
            type="button"
            className="btn"
            onClick={onCancel}
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn delete-products-confirm"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Trash2 size={17} />
            )}
            {busy ? "Excluindo..." : "Sim, excluir"}
          </button>
        </footer>
      </section>
    </div>
  );
}
