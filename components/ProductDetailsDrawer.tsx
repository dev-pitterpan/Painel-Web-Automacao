"use client";

import { useEffect } from "react";
import { ArrowRight, CheckCircle2, CircleAlert, Package, X } from "lucide-react";
import type { HistoryRow } from "@/lib/types";

function ValueCard({ label, before, after, changed }: { label: string; before: string; after: string; changed: boolean }) {
  return (
    <section className="comparison-card">
      <div className="comparison-card-head">
        <strong>{label}</strong>
        <span className={changed ? "change-state is-changed" : "change-state"}>{changed ? "Alterado" : "Sem alteração"}</span>
      </div>
      <div className="comparison-values">
        <div><small>Antes</small><p>{before || "Não informado"}</p></div>
        <ArrowRight size={16} aria-hidden="true" />
        <div><small>Depois</small><p>{after || "Não informado"}</p></div>
      </div>
    </section>
  );
}

export function ProductDetailsDrawer({ row, onClose }: { row: HistoryRow | null; onClose: () => void }) {
  useEffect(() => {
    if (!row) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", close);
    document.body.classList.add("drawer-open");
    return () => { document.removeEventListener("keydown", close); document.body.classList.remove("drawer-open"); };
  }, [row, onClose]);

  if (!row) return null;
  const failed = String(row.status || "").toLowerCase().startsWith("erro");
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <aside className="product-drawer" role="dialog" aria-modal="true" aria-labelledby="product-drawer-title">
        <header className="product-drawer-head">
          <span className="product-drawer-icon"><Package size={20} /></span>
          <div><small>Detalhes do processamento</small><h2 id="product-drawer-title">{row.tituloDepois || row.tituloAntes || "Produto sem título"}</h2></div>
          <button type="button" onClick={onClose} aria-label="Fechar detalhes"><X size={19} /></button>
        </header>
        <div className="product-drawer-meta">
          <span><small>SKU</small><strong>{row.sku || "—"}</strong></span>
          <span><small>Marca</small><strong>{row.marca || "—"}</strong></span>
          <span><small>Data e hora</small><strong>{row.dataHora || "—"}</strong></span>
          <span className={failed ? "drawer-status is-error" : "drawer-status"}>{failed ? <CircleAlert size={14} /> : <CheckCircle2 size={14} />}{failed ? "Erro" : "Sucesso"}</span>
        </div>
        <div className="product-drawer-body">
          <ValueCard label="Título" before={row.tituloAntes} after={row.tituloDepois} changed={row.tituloAlterado} />
          <ValueCard label="Tags" before={row.tagsAntes} after={row.tagsDepois} changed={row.tagsAlteradas} />
          <ValueCard label="Coleções" before={row.colecoesAntes} after={row.colecoesDepois} changed={row.colecoesAlteradas} />
          <section className="description-result">
            <div><strong>Descrição do produto</strong><small>A planilha registra a geração, mas não armazena o texto anterior e posterior.</small></div>
            <span className={row.descricaoGerada ? "is-generated" : ""}>{row.descricaoGerada ? "Gerada" : "Não gerada"}</span>
          </section>
        </div>
      </aside>
    </div>
  );
}
