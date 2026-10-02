"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  ProductDetailsDrawer,
  type UpdatedProduct,
} from "@/components/ProductDetailsDrawer";
import type { HistoryRow } from "@/lib/types";

type DockSide = "left" | "right" | "floating";
type ProductUpdateHandler = (row: HistoryRow, product: UpdatedProduct) => void;
type ProductPanelContextValue = {
  openProduct: (
    row: HistoryRow,
    canEdit: boolean,
    onProductUpdated?: ProductUpdateHandler,
  ) => void;
};

const ProductPanelContext = createContext<ProductPanelContextValue | null>(
  null,
);

export function ProductPanelProvider({ children }: { children: ReactNode }) {
  const [row, setRow] = useState<HistoryRow | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [dockSide, setDockSide] = useState<DockSide>("floating");
  const [dockWidth, setDockWidth] = useState(460);
  const updateHandler = useRef<ProductUpdateHandler | null>(null);
  useEffect(() => {
    const desktopSnap = window.matchMedia(
      "(min-width: 1280px) and (min-height: 700px)",
    );
    const releaseDockOnResize = () => {
      if (!desktopSnap.matches) setDockSide("floating");
    };
    releaseDockOnResize();
    desktopSnap.addEventListener("change", releaseDockOnResize);
    return () => desktopSnap.removeEventListener("change", releaseDockOnResize);
  }, []);
  const openProduct = (
    productRow: HistoryRow,
    editable: boolean,
    onProductUpdated?: ProductUpdateHandler,
  ) => {
    updateHandler.current = onProductUpdated || null;
    setCanEdit(editable);
    setRow(productRow);
  };
  const closeProduct = () => {
    updateHandler.current = null;
    setRow(null);
    setDockSide("floating");
    setDockWidth(460);
  };
  const handleProductUpdated = (
    updatedRow: HistoryRow,
    product: UpdatedProduct,
  ) => {
    const sourceTitle = updatedRow.tituloDepois || updatedRow.tituloAntes || "";
    setRow((current) =>
      current &&
      current.sku === updatedRow.sku &&
      (current.tituloDepois || current.tituloAntes || "") === sourceTitle
        ? {
            ...current,
            tituloDepois: product.title,
            tagsDepois: product.tags.join(", "),
            colecoesDepois: product.collections.join(", "),
          }
        : current,
    );
    updateHandler.current?.(updatedRow, product);
  };
  const shellClass = row
    ? `app-shell has-docked-product-${dockSide}`
    : "app-shell";

  return (
    <ProductPanelContext.Provider value={{ openProduct }}>
      <div
        className={shellClass}
        style={
          {
            "--product-panel-width": `${dockWidth}px`,
          } as CSSProperties
        }
      >
        {children}
        <ProductDetailsDrawer
          row={row}
          canEdit={canEdit}
          dockSide={dockSide}
          onDockSideChange={setDockSide}
          dockWidth={dockWidth}
          onDockWidthChange={setDockWidth}
          onClose={closeProduct}
          onProductUpdated={handleProductUpdated}
        />
      </div>
    </ProductPanelContext.Provider>
  );
}

export function useProductPanel() {
  const context = useContext(ProductPanelContext);
  if (!context)
    throw new Error(
      "useProductPanel deve ser usado dentro de ProductPanelProvider.",
    );
  return context;
}
