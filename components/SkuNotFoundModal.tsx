"use client";

import { AlertCircle, PackageSearch, X } from "lucide-react";

export function SkuNotFoundModal({
  skus,
  onClose,
}: {
  skus: string[];
  onClose: () => void;
}) {
  if (!skus.length) return null;
  const subject = skus.join(", ");
  const message =
    skus.length === 1
      ? `${subject} não foi encontrado`
      : `${subject} não foram encontrados`;

  return (
    <div
      className="sku-not-found-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sku-not-found-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="sku-not-found-modal">
        <button
          className="sku-not-found-close"
          type="button"
          onClick={onClose}
          aria-label="Fechar"
        >
          <X size={20} />
        </button>
        <div className="sku-not-found-icon" aria-hidden="true">
          <PackageSearch size={34} />
          <span>
            <AlertCircle size={16} />
          </span>
        </div>
        <span className="sku-not-found-category">Produtos não encontrados</span>
        <h2 id="sku-not-found-title">
          {skus.length === 1
            ? "SKU não localizado"
            : `${skus.length} SKUs não localizados`}
        </h2>
        <p>{message}</p>
        <div className="sku-not-found-list" aria-label="SKUs não encontrados">
          {skus.map((sku) => (
            <span key={sku}>{sku}</span>
          ))}
        </div>
        <button
          className="sku-not-found-confirm"
          type="button"
          onClick={onClose}
        >
          Entendi
        </button>
      </section>
    </div>
  );
}
