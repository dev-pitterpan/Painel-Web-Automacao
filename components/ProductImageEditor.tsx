"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Crop,
  Maximize2,
  Minus,
  Move,
  Plus,
  RotateCcw,
  RotateCw,
  X,
} from "lucide-react";

const OUTPUT_SIZE = 1000;
const JPEG_QUALITY = 0.9;

type Props = {
  source: string;
  alt: string;
  onCancel: () => void;
  onApply: (source: string) => void;
};

type ImageSize = { width: number; height: number };

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("Não foi possível abrir esta imagem."));
    image.src = source;
  });
}

export default function ProductImageEditor({
  source,
  alt,
  onCancel,
  onApply,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void loadImage(source)
      .then((image) => {
        if (active)
          setImageSize({
            width: image.naturalWidth,
            height: image.naturalHeight,
          });
      })
      .catch((cause) => {
        if (active)
          setError(cause instanceof Error ? cause.message : "Imagem inválida.");
      });
    return () => {
      active = false;
    };
  }, [source]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onCancel();
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onCancel, saving]);

  const rotatedSize = useMemo(() => {
    if (!imageSize) return null;
    const quarterTurn = Math.abs(rotation / 90) % 2 === 1;
    return quarterTurn
      ? { width: imageSize.height, height: imageSize.width }
      : imageSize;
  }, [imageSize, rotation]);

  const baseScale = rotatedSize
    ? Math.min(
        OUTPUT_SIZE / rotatedSize.width,
        OUTPUT_SIZE / rotatedSize.height,
      )
    : 1;
  const renderedWidth = imageSize ? imageSize.width * baseScale * zoom : 0;
  const renderedHeight = imageSize ? imageSize.height * baseScale * zoom : 0;

  function reset() {
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  }

  function rotate(direction: -1 | 1) {
    setRotation((current) => current + direction * 90);
    setOffset({ x: 0, y: 0 });
  }

  async function apply() {
    if (!imageSize) return;
    setSaving(true);
    setError("");
    try {
      const image = await loadImage(source);
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Não foi possível editar a imagem.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.translate(OUTPUT_SIZE / 2 + offset.x, OUTPUT_SIZE / 2 + offset.y);
      context.rotate((rotation * Math.PI) / 180);
      context.drawImage(
        image,
        -renderedWidth / 2,
        -renderedHeight / 2,
        renderedWidth,
        renderedHeight,
      );
      onApply(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível aplicar a edição.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="product-image-editor-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Editar imagem do produto"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onCancel();
      }}
    >
      <div className="product-image-editor-modal">
        <header>
          <div>
            <strong>Editar imagem</strong>
            <span>Recorte e posicione no formato 1000 × 1000 px</span>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            aria-label="Fechar editor"
          >
            <X size={20} />
          </button>
        </header>

        <div className="product-image-editor-body">
          <div className="product-image-editor-stage">
            <div
              ref={viewportRef}
              className="product-image-editor-viewport"
              onPointerDown={(event) => {
                if (!imageSize) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                dragRef.current = {
                  pointerId: event.pointerId,
                  x: event.clientX,
                  y: event.clientY,
                  offsetX: offset.x,
                  offsetY: offset.y,
                };
              }}
              onPointerMove={(event) => {
                const drag = dragRef.current;
                const viewport = viewportRef.current;
                if (!drag || drag.pointerId !== event.pointerId || !viewport)
                  return;
                const ratio = OUTPUT_SIZE / viewport.clientWidth;
                setOffset({
                  x: drag.offsetX + (event.clientX - drag.x) * ratio,
                  y: drag.offsetY + (event.clientY - drag.y) * ratio,
                });
              }}
              onPointerUp={(event) => {
                if (dragRef.current?.pointerId === event.pointerId)
                  dragRef.current = null;
              }}
              onPointerCancel={() => {
                dragRef.current = null;
              }}
            >
              {imageSize ? (
                <img
                  src={source}
                  alt={alt}
                  draggable={false}
                  style={{
                    width: `${(renderedWidth / OUTPUT_SIZE) * 100}%`,
                    height: `${(renderedHeight / OUTPUT_SIZE) * 100}%`,
                    left: `${50 + (offset.x / OUTPUT_SIZE) * 100}%`,
                    top: `${50 + (offset.y / OUTPUT_SIZE) * 100}%`,
                    transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                  }}
                />
              ) : (
                <span>{error || "Carregando imagem..."}</span>
              )}
              <div className="product-image-editor-grid" aria-hidden="true" />
            </div>
            <small>
              <Move size={14} /> Arraste a imagem para reposicionar
            </small>
          </div>

          <aside className="product-image-editor-tools">
            <section>
              <div className="product-image-editor-tool-title">
                <Crop size={17} />
                <strong>Recorte</strong>
              </div>
              <p>A área clara mostra exatamente o que será salvo.</p>
            </section>
            <section>
              <div className="product-image-editor-tool-title">
                <Maximize2 size={17} />
                <strong>Tamanho</strong>
                <output>{Math.round(zoom * 100)}%</output>
              </div>
              <div className="product-image-editor-zoom">
                <button
                  type="button"
                  onClick={() =>
                    setZoom((current) =>
                      Math.max(0.25, +(current - 0.1).toFixed(2)),
                    )
                  }
                  aria-label="Diminuir imagem"
                >
                  <Minus size={16} />
                </button>
                <input
                  type="range"
                  min="0.25"
                  max="4"
                  step="0.01"
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                  aria-label="Tamanho da imagem"
                />
                <button
                  type="button"
                  onClick={() =>
                    setZoom((current) =>
                      Math.min(4, +(current + 0.1).toFixed(2)),
                    )
                  }
                  aria-label="Aumentar imagem"
                >
                  <Plus size={16} />
                </button>
              </div>
            </section>
            <section>
              <div className="product-image-editor-tool-title">
                <RotateCw size={17} />
                <strong>Girar</strong>
              </div>
              <div className="product-image-editor-actions">
                <button type="button" onClick={() => rotate(-1)}>
                  <RotateCcw size={16} /> Esquerda
                </button>
                <button type="button" onClick={() => rotate(1)}>
                  <RotateCw size={16} /> Direita
                </button>
              </div>
            </section>
            <button
              className="product-image-editor-reset"
              type="button"
              onClick={reset}
            >
              Restaurar enquadramento
            </button>
            {error && <p className="product-image-editor-error">{error}</p>}
          </aside>
        </div>

        <footer>
          <button type="button" onClick={onCancel} disabled={saving}>
            Cancelar
          </button>
          <button
            type="button"
            className="is-primary"
            onClick={() => void apply()}
            disabled={saving || !imageSize}
          >
            <Check size={17} /> {saving ? "Aplicando..." : "Aplicar edição"}
          </button>
        </footer>
      </div>
    </div>
  );
}
