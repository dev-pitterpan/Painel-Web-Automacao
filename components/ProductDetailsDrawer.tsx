"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bold,
  Check,
  CheckCircle2,
  CircleAlert,
  CalendarDays,
  FileText,
  ImageIcon,
  ImagePlus,
  GripVertical,
  Italic,
  List,
  ListOrdered,
  Layers3,
  Info,
  LoaderCircle,
  Package,
  Pencil,
  Plus,
  Search,
  Scale,
  ShoppingBag,
  Tag,
  Code2,
  Underline,
  Trash2,
  X,
} from "lucide-react";
import type { HistoryRow } from "@/lib/types";
import {
  getCachedProductImage,
  setCachedProductImage,
} from "@/components/ProductThumbnail";
import {
  invalidateProductDetails,
  loadProductDetails,
} from "@/components/ProductDetailsCache";

type DrawerStep = "details" | "edit";
type SuccessPhase = "hidden" | "visible" | "leaving";
type WinthorProductStatus = {
  status: "ATIVO" | "FORA_DE_LINHA" | "PENDENTE";
  description: string;
  syncedAt: string;
};
type EditForm = {
  title: string;
  description: string;
  tags: string;
  collections: string;
  weight: string;
  weightUnit: "g" | "kg";
};
export type UpdatedProduct = {
  title: string;
  description?: string;
  tags: string[];
  collections: string[];
  weight: number;
  weightUnit: "g" | "kg";
};
type ProductMedia = {
  id?: string;
  url: string;
  alt: string;
  isNew?: boolean;
  isDeleted?: boolean;
  originalPosition?: number;
};

/* Limites do painel ancorado (apenas desktop, via ProductPanelProvider).
   O mínimo mantém o painel legível e o máximo preserva uma área útil na tela
   para o restante do conteúdo. */
const DOCK_MIN_WIDTH = 320;
const DOCK_MAX_WIDTH = 760;
const DOCK_MIN_CONTENT_WIDTH = 480;

function splitChoices(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function ChoicePicker({
  label,
  value,
  options,
  onChange,
  icon,
  actionLabel,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  icon: ReactNode;
  actionLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);
  const selected = splitChoices(value);
  const normalize = (item: string) => item.toLocaleLowerCase("pt-BR");
  const selectedKeys = new Set(selected.map(normalize));
  const choices = [...new Set([...options, ...selected])].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
  const filtered = choices.filter((item) =>
    normalize(item).includes(normalize(search)),
  );
  const exactMatch = choices.some(
    (item) => normalize(item) === normalize(search.trim()),
  );
  const setSelected = (next: string[]) => onChange(next.join(", "));
  const toggle = (item: string) =>
    setSelected(
      selectedKeys.has(normalize(item))
        ? selected.filter((current) => normalize(current) !== normalize(item))
        : [...selected, item],
    );
  const create = () => {
    const item = search.trim();
    if (!item || exactMatch) return;
    setSelected([...selected, item]);
    setSearch("");
  };

  return (
    <div ref={pickerRef} className={`choice-picker ${open ? "is-open" : ""}`}>
      <span className="product-edit-card-icon">{icon}</span>
      <div className="choice-picker-body">
        <div className="choice-picker-label">
          <span>{label}</span>
          {actionLabel && (
            <button
              type="button"
              onClick={() => setOpen((current) => !current)}
            >
              {actionLabel}
            </button>
          )}
        </div>
        <div
          className="choice-picker-control"
          role="button"
          tabIndex={0}
          onClick={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setOpen(true);
            }
          }}
        >
          {selected.length ? (
            selected.map((item) => (
              <span className="choice-picker-chip" key={normalize(item)}>
                {item}
                <button
                  type="button"
                  aria-label={`Remover ${item}`}
                  title={`Remover ${item}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggle(item);
                  }}
                >
                  <X size={11} />
                </button>
              </span>
            ))
          ) : (
            <em>Nenhum item selecionado</em>
          )}
        </div>
      </div>
      {open && (
        <div className="choice-picker-menu">
          <div className="choice-picker-search">
            <Search size={15} />
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  create();
                }
                if (event.key === "Escape") setOpen(false);
              }}
              placeholder={`Pesquisar ou adicionar ${label.toLocaleLowerCase("pt-BR")}`}
            />
          </div>
          <div className="choice-picker-options">
            {filtered.map((item) => {
              const checked = selectedKeys.has(normalize(item));
              return (
                <button
                  type="button"
                  key={normalize(item)}
                  onClick={() => toggle(item)}
                >
                  <span className={checked ? "is-checked" : ""}>
                    {checked && <Check size={12} />}
                  </span>
                  {item}
                </button>
              );
            })}
            {!filtered.length && exactMatch && <small>Nenhum resultado.</small>}
          </div>
          {search.trim() && !exactMatch && (
            <button
              className="choice-picker-create"
              type="button"
              onClick={create}
            >
              <Plus size={15} />
              Criar “{search.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const currentTitle = (row: HistoryRow) =>
  row.tituloDepois || row.tituloAntes || "";
const currentTags = (row: HistoryRow) => row.tagsDepois || row.tagsAntes || "";
const currentCollections = (row: HistoryRow) =>
  row.colecoesDepois || row.colecoesAntes || "";
const fallbackForm = (row: HistoryRow): EditForm => ({
  title: currentTitle(row),
  description: "",
  tags: currentTags(row),
  collections: currentCollections(row),
  weight: "",
  weightUnit: "g",
});
const listText = (value: unknown) =>
  Array.isArray(value) ? value.map(String).join(", ") : String(value ?? "");

function safeDescriptionHtml(value: string) {
  return String(value || "")
    .replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}

function HtmlDescriptionEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [sourceMode, setSourceMode] = useState(false);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || sourceMode || document.activeElement === editor) return;
    const safeHtml = safeDescriptionHtml(value);
    if (editor.innerHTML !== safeHtml) editor.innerHTML = safeHtml;
  }, [value, sourceMode]);

  const format = (command: string) => {
    editorRef.current?.focus();
    document.execCommand(command);
    onChange(editorRef.current?.innerHTML || "");
  };

  return (
    <div className="html-description-editor">
      <div className="html-editor-toolbar" aria-label="Formatação da descrição">
        <button type="button" onClick={() => format("bold")} title="Negrito">
          <Bold size={15} />
        </button>
        <button type="button" onClick={() => format("italic")} title="Itálico">
          <Italic size={15} />
        </button>
        <button
          type="button"
          onClick={() => format("underline")}
          title="Sublinhado"
        >
          <Underline size={15} />
        </button>
        <span />
        <button
          type="button"
          onClick={() => format("insertUnorderedList")}
          title="Lista"
        >
          <List size={16} />
        </button>
        <button
          type="button"
          onClick={() => format("insertOrderedList")}
          title="Lista numerada"
        >
          <ListOrdered size={16} />
        </button>
        <button
          className={sourceMode ? "is-active" : ""}
          type="button"
          onClick={() => setSourceMode((current) => !current)}
          title={sourceMode ? "Visualizar formatado" : "Visualizar HTML"}
        >
          <Code2 size={16} />
        </button>
      </div>
      {sourceMode ? (
        <textarea
          className="html-editor-source"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={10}
          spellCheck={false}
        />
      ) : (
        <div
          ref={editorRef}
          className="html-editor-content"
          contentEditable
          suppressContentEditableWarning
          onInput={(event) => onChange(event.currentTarget.innerHTML)}
          dangerouslySetInnerHTML={{ __html: safeDescriptionHtml(value) }}
        />
      )}
      <small>
        A visualização é formatada; o conteúdo continua sendo salvo em HTML.
      </small>
    </div>
  );
}

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

export function ProductDetailsDrawer({
  row,
  onClose,
  onActiveRowChange,
  onProductUpdated,
  canEdit = false,
  dockSide = "floating",
  onDockSideChange,
  dockWidth = 460,
  onDockWidthChange,
}: {
  row: HistoryRow | null;
  onClose: () => void;
  onActiveRowChange?: (row: HistoryRow) => void;
  onProductUpdated?: (row: HistoryRow, product: UpdatedProduct) => void;
  canEdit?: boolean;
  dockSide?: "left" | "right" | "floating";
  onDockSideChange?: (side: "left" | "right" | "floating") => void;
  dockWidth?: number;
  onDockWidthChange?: (width: number) => void;
}) {
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [position, setPosition] = useState({ x: 24, y: 72 });
  const dragOffset = useRef({ x: 0, y: 0 });
  const pointerOrigin = useRef({ x: 0, y: 0 });
  const dockedDragStart = useRef(false);
  const snapTarget = useRef<"left" | "right" | null>(null);
  const resizeStart = useRef({ x: 0, width: dockWidth });
  const dockWidthRef = useRef(dockWidth);
  const [dockRange, setDockRange] = useState({
    minWidth: DOCK_MIN_WIDTH,
    maxWidth: DOCK_MAX_WIDTH,
  });
  const [snapPreview, setSnapPreview] = useState<"left" | "right" | null>(null);
  const windowRef = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);
  const previousDockSide = useRef(dockSide);
  const [step, setStep] = useState<DrawerStep>("details");
  const [form, setForm] = useState<EditForm | null>(null);
  const [original, setOriginal] = useState<EditForm | null>(null);
  const [loadingProduct, setLoadingProduct] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [media, setMedia] = useState<ProductMedia[]>([]);
  const [originalMedia, setOriginalMedia] = useState<ProductMedia[]>([]);
  const [mediaSlideIndex, setMediaSlideIndex] = useState(0);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaDragging, setMediaDragging] = useState(false);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [availableCollections, setAvailableCollections] = useState<string[]>(
    [],
  );
  const [draggedMediaIndex, setDraggedMediaIndex] = useState<number | null>(
    null,
  );
  const [mediaDropIndex, setMediaDropIndex] = useState<number | null>(null);
  const [successPhase, setSuccessPhase] = useState<SuccessPhase>("hidden");
  const [winthorStatus, setWinthorStatus] =
    useState<WinthorProductStatus | null>(null);
  const successTimers = useRef<number[]>([]);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!row) return;
    setHistory((current) => {
      const trimmed =
        historyIndex >= 0 ? current.slice(0, historyIndex + 1) : current;
      const last = trimmed.at(-1);
      if (last?.sku === row.sku && last?.dataHora === row.dataHora)
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
    if (activeRow) onActiveRowChange?.(activeRow);
  }, [activeRow, onActiveRowChange]);

  useEffect(() => {
    if (!activeRow?.sku) {
      setWinthorStatus(null);
      return;
    }
    const controller = new AbortController();
    setWinthorStatus(null);
    void fetch(
      `/api/winthor-products?sku=${encodeURIComponent(activeRow.sku)}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return (await response.json()) as WinthorProductStatus;
      })
      .then(setWinthorStatus)
      .catch(() => {
        if (!controller.signal.aborted)
          setWinthorStatus({
            status: "PENDENTE",
            description: "",
            syncedAt: "",
          });
      });
    return () => controller.abort();
  }, [activeRow?.sku]);

  useEffect(() => {
    if (!activeRow) return;
    const initial = fallbackForm(activeRow);
    const cachedImage = getCachedProductImage(
      activeRow.sku,
      currentTitle(activeRow),
    );
    const cachedMedia = cachedImage
      ? [{ url: cachedImage.url, alt: cachedImage.alt }]
      : [];
    setStep("details");
    setForm(initial);
    setOriginal(initial);
    setMedia(cachedMedia);
    setOriginalMedia(cachedMedia);
    setAvailableTags([]);
    setAvailableCollections([]);
    setMediaSlideIndex(0);
    setMessage("");
    setError("");
    // Atualizações do produto recriam a linha no provider. A identidade abaixo
    // evita apagar descrição e mídia quando a mesma linha acabou de ser salva.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRow?.sku, activeRow?.dataHora]);

  useEffect(() => {
    if (!activeRow || !canEdit) return;
    void openEditor(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRow?.sku, canEdit]);

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
    if (
      previousDockSide.current !== "floating" &&
      dockSide === "floating" &&
      !window.matchMedia("(min-width: 1280px) and (min-height: 700px)").matches
    ) {
      const width = Math.min(960, window.innerWidth - 32);
      const height = Math.min(760, window.innerHeight - 48);
      setPosition({
        x: Math.max(8, Math.round((window.innerWidth - width) / 2)),
        y: Math.max(16, Math.round((window.innerHeight - height) / 2)),
      });
    }
    previousDockSide.current = dockSide;
  }, [dockSide]);

  useEffect(() => {
    if (!row) return;
    const close = (event: KeyboardEvent) =>
      event.key === "Escape" && !saving && onClose();
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [row, onClose, saving]);

  useEffect(
    () => () => {
      successTimers.current.forEach((timer) => window.clearTimeout(timer));
    },
    [],
  );

  useEffect(() => {
    if (!row || step !== "edit") return;
    const pasteImage = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.items || [])
        .filter(
          (item) => item.kind === "file" && item.type.startsWith("image/"),
        )
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
      if (!files.length) return;
      event.preventDefault();
      void processMediaFiles(files);
    };
    document.addEventListener("paste", pasteImage);
    return () => document.removeEventListener("paste", pasteImage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row, step, media, mediaLoading, form]);

  const changedFields = useMemo(() => {
    if (!form || !original) return 0;
    return (
      [
        "title",
        "description",
        "tags",
        "collections",
        "weight",
        "weightUnit",
      ] as const
    ).filter((field) => form[field].trim() !== original[field].trim()).length;
  }, [form, original]);
  const newMediaCount = media.filter((item) => item.isNew).length;
  const deletedMediaCount = media.filter(
    (item) => item.isDeleted && item.id,
  ).length;
  const visibleMedia = useMemo(
    () => media.filter((item) => !item.isDeleted && item.url),
    [media],
  );
  useEffect(() => {
    setMediaSlideIndex((current) =>
      visibleMedia.length ? Math.min(current, visibleMedia.length - 1) : 0,
    );
  }, [visibleMedia.length]);
  useEffect(() => {
    dockWidthRef.current = dockWidth;
  }, [dockWidth]);
  // Mantém a largura ancorada válida quando a janela muda de tamanho ou a
  // sidebar recolhe: sem isso o painel poderia ficar largo demais (conteúdo
  // espremido) ou estreito demais após um redimensionamento.
  useEffect(() => {
    if (dockSide === "floating") return;
    const clampToRange = () => {
      const range = getDockWidthRange();
      setDockRange(range);
      const current = dockWidthRef.current;
      const clamped = Math.min(
        range.maxWidth,
        Math.max(range.minWidth, current),
      );
      if (clamped !== current) applyDockWidth(clamped);
    };
    clampToRange();
    const shell = windowRef.current?.closest<HTMLElement>(".app-shell") ?? null;
    const sidebar = shell?.querySelector<HTMLElement>(".sidebar") ?? null;
    const observer =
      shell && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(clampToRange)
        : null;
    if (shell) observer?.observe(shell);
    if (sidebar) observer?.observe(sidebar);
    window.addEventListener("resize", clampToRange);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", clampToRange);
    };
  }, [dockSide, onDockWidthChange]);
  // O redimensionamento nativo do modo flutuante (CSS `resize: both`) grava
  // width/height como estilo inline na <aside> e o React nunca remove. Ao
  // ancorar, esses valores congelariam a largura e a altura da aba. Limpar
  // aqui garante que o painel ancorado responda a --product-panel-width.
  useEffect(() => {
    if (dockSide === "floating") return;
    const node = windowRef.current;
    if (!node) return;
    node.style.removeProperty("width");
    node.style.removeProperty("height");
  }, [dockSide]);
  const desiredMediaIds = media
    .filter((item) => item.id && !item.isDeleted && !item.isNew)
    .map((item) => item.id);
  const originalMediaIds = originalMedia
    .filter(
      (item) =>
        item.id && !media.find((current) => current.id === item.id)?.isDeleted,
    )
    .map((item) => item.id);
  const mediaOrderChanged = desiredMediaIds.some(
    (id, index) => id !== originalMediaIds[index],
  );
  const totalChanges =
    changedFields +
    newMediaCount +
    deletedMediaCount +
    (mediaOrderChanged ? 1 : 0);

  if (!row || !activeRow || !form || !original) return null;
  const failed = String(activeRow.status || "")
    .toLowerCase()
    .startsWith("erro");
  const title = currentTitle(activeRow) || "Produto sem título";
  const update = (field: keyof EditForm, value: string) =>
    setForm((current) => (current ? { ...current, [field]: value } : current));

  function startDragging(event: React.PointerEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("button")) return;
    const bounds = windowRef.current?.getBoundingClientRect();
    dockedDragStart.current = dockSide !== "floating";
    pointerOrigin.current = { x: event.clientX, y: event.clientY };
    dragOffset.current = {
      x: event.clientX - (bounds?.left ?? position.x),
      y: event.clientY - (bounds?.top ?? position.y),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function dragWindow(event: React.PointerEvent<HTMLElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    if (dockedDragStart.current) {
      const distance = Math.hypot(
        event.clientX - pointerOrigin.current.x,
        event.clientY - pointerOrigin.current.y,
      );
      if (distance < 4) return;
      const bounds = windowRef.current?.getBoundingClientRect();
      setPosition({
        x: bounds?.left ?? position.x,
        y: bounds?.top ?? position.y,
      });
      dockedDragStart.current = false;
      onDockSideChange?.("floating");
    }
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
    const canSnap = window.matchMedia(
      "(min-width: 1280px) and (min-height: 700px)",
    ).matches;
    const snapSide = canSnap
      ? next.x <= 20
        ? "left"
        : next.x + width >= window.innerWidth - 20
          ? "right"
          : null
      : null;
    snapTarget.current = snapSide;
    setSnapPreview(snapSide);
    setPosition(next);
  }
  function stopDragging(event: React.PointerEvent<HTMLElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    dockedDragStart.current = false;
    const side = snapTarget.current;
    snapTarget.current = null;
    setSnapPreview(null);
    if (!side) return;
    const { minWidth, maxWidth } = getDockWidthRange();
    const preferred = Math.min(
      560,
      Math.max(440, Math.round(getWorkspaceWidth() * 0.42)),
    );
    applyDockWidth(Math.min(maxWidth, Math.max(minWidth, preferred)));
    onDockSideChange?.(side);
  }
  function applyDockWidth(width: number) {
    dockWidthRef.current = width;
    onDockWidthChange?.(width);
  }
  function getWorkspaceWidth() {
    const shell = windowRef.current?.closest<HTMLElement>(".app-shell");
    const sidebar = shell?.querySelector<HTMLElement>(".sidebar");
    return (
      (shell?.clientWidth || window.innerWidth) -
      (sidebar?.getBoundingClientRect().width || 0)
    );
  }
  function getDockWidthRange() {
    const workspaceWidth = getWorkspaceWidth();
    const minWidth = Math.min(
      DOCK_MIN_WIDTH,
      Math.max(280, Math.round(workspaceWidth * 0.26)),
    );
    return {
      minWidth,
      maxWidth: Math.max(
        minWidth,
        Math.min(DOCK_MAX_WIDTH, workspaceWidth - DOCK_MIN_CONTENT_WIDTH),
      ),
    };
  }
  function startResizing(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    resizeStart.current = { x: event.clientX, width: dockWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function resizeDock(event: React.PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const { minWidth, maxWidth } = getDockWidthRange();
    const delta =
      dockSide === "right"
        ? resizeStart.current.x - event.clientX
        : event.clientX - resizeStart.current.x;
    applyDockWidth(
      Math.min(maxWidth, Math.max(minWidth, resizeStart.current.width + delta)),
    );
  }
  function stopResizing(event: React.PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function resizeWithKeyboard(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction =
      (dockSide === "right" && event.key === "ArrowLeft") ||
      (dockSide === "left" && event.key === "ArrowRight")
        ? 1
        : -1;
    const { minWidth, maxWidth } = getDockWidthRange();
    applyDockWidth(
      Math.min(maxWidth, Math.max(minWidth, dockWidth + direction * 16)),
    );
  }

  async function openEditor(showEditor = true) {
    setLoadingProduct(true);
    setError("");
    setMessage("");
    try {
      const product = await loadProductDetails(
        activeRow!.sku,
        currentTitle(activeRow!),
      );
      const productMedia = Array.isArray(product.images)
        ? product.images
        : Array.isArray(product.media)
          ? product.media
          : [];
      const next: EditForm = {
        title: String(product.title ?? currentTitle(activeRow!)),
        description: String(
          product.description ?? product.descriptionHtml ?? "",
        ),
        tags: listText(product.tags ?? currentTags(activeRow!)),
        collections: listText(
          product.collections ?? currentCollections(activeRow!),
        ),
        weight: String(product.weight ?? ""),
        weightUnit: product.weightUnit === "kg" ? "kg" : "g",
      };
      setForm(next);
      setOriginal(next);
      setAvailableTags(
        Array.isArray(product.availableTags)
          ? product.availableTags.map(String)
          : [],
      );
      setAvailableCollections(
        Array.isArray(product.availableCollections)
          ? product.availableCollections.map(String)
          : [],
      );
      const loadedMedia = productMedia
        .map((item: any, index: number) => ({
          id: String(item?.id || ""),
          url: String(item?.url || item?.src || item?.image?.url || ""),
          alt: String(item?.alt || item?.altText || ""),
          originalPosition: index,
        }))
        .filter((item: ProductMedia) => item.url);
      setMedia(loadedMedia);
      setOriginalMedia(loadedMedia);
      setCachedProductImage(
        activeRow!.sku,
        loadedMedia[0]
          ? { url: loadedMedia[0].url, alt: loadedMedia[0].alt }
          : null,
        currentTitle(activeRow!),
      );
      if (showEditor) setStep("edit");
    } catch (cause) {
      if (showEditor) {
        const initial = fallbackForm(activeRow!);
        setForm(initial);
        setOriginal(initial);
        setStep("edit");
        setError(
          `${cause instanceof Error ? cause.message : "Falha ao consultar o Shopify."} Você ainda pode visualizar o editor; o envio ficará disponível após configurar o workflow.`,
        );
      }
    } finally {
      setLoadingProduct(false);
    }
  }

  async function processMediaFiles(files: File[]) {
    if (!files.length) return;
    if (mediaLoading) return;
    const available = Math.max(
      0,
      5 - media.filter((item) => item.isNew).length,
    );
    if (!available) {
      setError("Salve as imagens atuais antes de adicionar outras.");
      return;
    }
    setMediaLoading(true);
    setError("");
    try {
      const additions = await Promise.all(
        files.slice(0, available).map(async (file) => {
          if (
            !/^image\/(png|jpeg|webp)$/.test(file.type) ||
            file.size > 10 * 1024 * 1024
          )
            throw new Error("Use imagens PNG, JPG ou WebP de até 10 MB.");
          const source = URL.createObjectURL(file);
          try {
            const image = new Image();
            await new Promise<void>((resolve, reject) => {
              image.onload = () => resolve();
              image.onerror = () => reject(new Error("Imagem inválida."));
              image.src = source;
            });
            const scale = Math.min(
              1,
              1600 / Math.max(image.naturalWidth, image.naturalHeight),
            );
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(image.naturalWidth * scale);
            canvas.height = Math.round(image.naturalHeight * scale);
            const context = canvas.getContext("2d");
            if (!context)
              throw new Error("Não foi possível processar a imagem.");
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            return {
              url: canvas.toDataURL("image/jpeg", 0.84),
              alt: form!.title,
              isNew: true,
            } satisfies ProductMedia;
          } finally {
            URL.revokeObjectURL(source);
          }
        }),
      );
      setMedia((current) => [...current, ...additions]);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Falha ao adicionar imagem.",
      );
    } finally {
      setMediaLoading(false);
    }
  }

  async function addMedia(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    await processMediaFiles(files);
  }

  async function saveProduct() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const originalSurvivingIds = originalMedia
        .filter(
          (item) =>
            item.id &&
            !media.find((current) => current.id === item.id)?.isDeleted,
        )
        .map((item) => item.id!);
      const desiredExistingIds = media
        .filter((item) => item.id && !item.isDeleted && !item.isNew)
        .map((item) => item.id!);
      const workingIds = [...originalSurvivingIds];
      const mediaMoves: Array<{ id: string; newPosition: number }> = [];
      desiredExistingIds.forEach((id, newPosition) => {
        const currentPosition = workingIds.indexOf(id);
        if (currentPosition < 0 || currentPosition === newPosition) return;
        workingIds.splice(currentPosition, 1);
        workingIds.splice(newPosition, 0, id);
        mediaMoves.push({ id, newPosition });
      });
      const imageReorder = media
        .filter((item) => item.id && !item.isDeleted && !item.isNew)
        .map((item, position) => ({
          from: item.originalPosition ?? position,
          to: position,
        }))
        .filter((move) => move.from !== move.to);
      const response = await fetch("/api/shopify/product-editor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: activeRow!.sku,
          titleHint: currentTitle(activeRow!),
          title: form!.title,
          description: form!.description,
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
          images: media
            .filter((item) => !item.isDeleted)
            .map((item, position) => ({ item, position }))
            .filter(({ item }) => item.isNew)
            .map(({ item, position }) => ({
              source: item.url,
              alt: item.alt,
              position,
            })),
          deleteMediaIds: media
            .filter((item) => item.isDeleted && item.id)
            .map((item) => item.id),
          deleteImagePositions: media
            .map((item, position) => ({ item, position }))
            .filter(({ item }) => item.isDeleted && item.id)
            .map(({ position }) => position),
          mediaMoves,
          imageReorder,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(body.error || "Não foi possível atualizar o produto.");
      invalidateProductDetails(activeRow!.sku, currentTitle(activeRow!));
      onProductUpdated?.(activeRow!, body.product);
      setOriginal(form!);
      const returnedMedia = body.product?.images;
      if (Array.isArray(returnedMedia) && returnedMedia.length) {
        const savedMedia = returnedMedia
          .map((item: any, index: number) => ({
            id: String(item?.id || ""),
            url: String(item?.url || item?.src || item?.image?.url || ""),
            alt: String(item?.alt || item?.altText || ""),
            originalPosition: index,
          }))
          .filter((item: ProductMedia) => item.url);
        setMedia(savedMedia);
        setOriginalMedia(savedMedia);
        setCachedProductImage(
          activeRow!.sku,
          { url: savedMedia[0].url, alt: savedMedia[0].alt },
          form!.title,
        );
      } else {
        const remaining = media.filter(
          (item) => !item.isDeleted && !item.isNew,
        );
        setMedia(remaining);
        setOriginalMedia(remaining);
        setCachedProductImage(
          activeRow!.sku,
          remaining[0]
            ? { url: remaining[0].url, alt: remaining[0].alt }
            : null,
          form!.title,
        );
      }
      setMessage("");
      setStep("details");
      windowRef.current?.scrollTo({ top: 0, left: 0 });
      successTimers.current.forEach((timer) => window.clearTimeout(timer));
      setSuccessPhase("visible");
      successTimers.current = [
        window.setTimeout(() => setSuccessPhase("leaving"), 2400),
        window.setTimeout(() => setSuccessPhase("hidden"), 3000),
      ];
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
    <>
      {snapPreview && (
        <div
          className={`product-snap-preview is-${snapPreview}`}
          aria-hidden="true"
        />
      )}
      <aside
        ref={windowRef}
        className={`product-drawer product-editor-drawer product-floating-window ${dockSide !== "floating" ? `is-docked-${dockSide}` : ""} ${step === "edit" ? "is-editing-product" : ""}`}
        role="dialog"
        aria-modal="false"
        aria-labelledby="product-drawer-title"
        style={
          dockSide === "floating"
            ? { left: position.x, top: position.y }
            : undefined
        }
      >
        {dockSide !== "floating" && (
          <div
            className="product-dock-resize-handle"
            role="separator"
            aria-orientation="vertical"
            aria-label="Redimensionar painel do produto"
            aria-valuenow={dockWidth}
            aria-valuemin={dockRange.minWidth}
            aria-valuemax={dockRange.maxWidth}
            aria-valuetext={`${dockWidth} pixels de largura`}
            title="Arraste para redimensionar o painel"
            tabIndex={0}
            onPointerDown={startResizing}
            onPointerMove={resizeDock}
            onPointerUp={stopResizing}
            onKeyDown={resizeWithKeyboard}
          />
        )}
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
              setHistoryIndex((index) =>
                Math.min(history.length - 1, index + 1),
              )
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
                : "Editar produto"}
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
          <span className="product-meta-item">
            {step === "edit" && (
              <i>
                <Tag size={18} />
              </i>
            )}
            <span>
              <small>SKU</small>
              <strong>{activeRow.sku || "—"}</strong>
            </span>
          </span>
          <span className="product-meta-item">
            {step === "edit" && (
              <i>
                <ShoppingBag size={18} />
              </i>
            )}
            <span>
              <small>Marca</small>
              <strong>{activeRow.marca || "—"}</strong>
            </span>
          </span>
          <span className="product-meta-item">
            {step === "edit" && (
              <i>
                <CalendarDays size={18} />
              </i>
            )}
            <span>
              <small>Última atualização</small>
              <strong>{activeRow.dataHora || "—"}</strong>
            </span>
          </span>
          <div className="drawer-status-actions">
            <span
              className={failed ? "drawer-status is-error" : "drawer-status"}
            >
              {failed ? <CircleAlert size={14} /> : <CheckCircle2 size={14} />}
              {failed ? "Erro" : "Sincronizado"}
            </span>
            {step === "details" && (
              <button
                className={`drawer-edit-button ${loadingProduct ? "is-loading" : ""}`}
                type="button"
                onClick={() => openEditor(true)}
                disabled={loadingProduct || !canEdit}
                title={
                  canEdit
                    ? "Editar informações do produto"
                    : "Apenas administradores podem editar produtos"
                }
                aria-label="Editar informações do produto"
              >
                {loadingProduct ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <Pencil size={15} />
                )}
                <span>Editar</span>
              </button>
            )}
          </div>
          <span
            className={`drawer-winthor-status is-${(winthorStatus?.status || "PENDENTE").toLowerCase()}`}
            title={winthorStatus?.description || "Status no WinThor"}
          >
            <small>Status WinThor</small>
            <strong>
              {winthorStatus?.status === "FORA_DE_LINHA"
                ? "Fora de linha"
                : winthorStatus?.status === "ATIVO"
                  ? "Ativo"
                  : "Aguardando sincronização"}
            </strong>
          </span>
        </div>
        <div className="product-drawer-scroll">
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
              <div className="product-drawer-body">
                <section className="product-current-overview">
                  <div className="product-current-image">
                    {visibleMedia[mediaSlideIndex]?.url ? (
                      <>
                        <img
                          src={visibleMedia[mediaSlideIndex].url}
                          alt={visibleMedia[mediaSlideIndex].alt || title}
                        />
                        {visibleMedia.length > 1 && (
                          <>
                            <button
                              className="product-current-image-nav is-previous"
                              type="button"
                              aria-label="Imagem anterior"
                              onClick={() =>
                                setMediaSlideIndex((current) =>
                                  current === 0
                                    ? visibleMedia.length - 1
                                    : current - 1,
                                )
                              }
                            >
                              <ArrowLeft size={17} />
                            </button>
                            <button
                              className="product-current-image-nav is-next"
                              type="button"
                              aria-label="Próxima imagem"
                              onClick={() =>
                                setMediaSlideIndex((current) =>
                                  current === visibleMedia.length - 1
                                    ? 0
                                    : current + 1,
                                )
                              }
                            >
                              <ArrowRight size={17} />
                            </button>
                            <small className="product-current-image-count">
                              {mediaSlideIndex + 1} / {visibleMedia.length}
                            </small>
                          </>
                        )}
                      </>
                    ) : (
                      <span>
                        <ImageIcon size={28} />
                        {loadingProduct ? "Carregando imagem..." : "Sem imagem"}
                      </span>
                    )}
                  </div>
                  <div className="product-current-description">
                    <strong>Descrição atual</strong>
                    {form.description ? (
                      <div
                        className="shopify-description-preview"
                        dangerouslySetInnerHTML={{
                          __html: safeDescriptionHtml(form.description),
                        }}
                      />
                    ) : (
                      <p>Descrição não informada no Shopify.</p>
                    )}
                  </div>
                </section>
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
                  <span
                    className={activeRow.descricaoGerada ? "is-generated" : ""}
                  >
                    {activeRow.descricaoGerada ? "Gerada" : "Não gerada"}
                  </span>
                </section>
              </div>
            </>
          )}

          {step === "edit" && (
            <form
              id="product-edit-form"
              className="product-edit-form"
              onSubmit={(event) => {
                event.preventDefault();
                void saveProduct();
              }}
            >
              <div className="editor-phase-notice">
                <Info size={16} />
                <span>
                  Os valores abaixo foram consultados no Shopify. A atualização
                  só acontece depois da confirmação.
                </span>
              </div>
              <section className="product-edit-card product-title-card">
                <span className="product-edit-card-icon">
                  <FileText size={18} />
                </span>
                <label className="product-edit-field">
                  <span>Título</span>
                  <small className="product-field-help">Nome do produto</small>
                  <input
                    value={form.title}
                    onChange={(event) => update("title", event.target.value)}
                    maxLength={255}
                    required
                  />
                  <small>{form.title.length}/255 caracteres</small>
                </label>
              </section>
              <section className="product-edit-card product-description-card">
                <span className="product-edit-card-icon">
                  <FileText size={18} />
                </span>
                <label className="product-edit-field">
                  <span>Descrição</span>
                  <HtmlDescriptionEditor
                    value={form.description}
                    onChange={(html) => update("description", html)}
                  />
                </label>
              </section>
              <section
                className={`product-media-editor product-edit-card ${mediaDragging ? "is-dragging" : ""}`}
                onDragEnter={(event) => {
                  event.preventDefault();
                  if (event.dataTransfer.types.includes("Files"))
                    setMediaDragging(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "copy";
                }}
                onDragLeave={(event) => {
                  if (event.currentTarget.contains(event.relatedTarget as Node))
                    return;
                  setMediaDragging(false);
                }}
                onDrop={(event) => {
                  if (!event.dataTransfer.files.length) return;
                  event.preventDefault();
                  setMediaDragging(false);
                  void processMediaFiles(Array.from(event.dataTransfer.files));
                }}
              >
                <span className="product-edit-card-icon">
                  <ImageIcon size={18} />
                </span>
                <div className="product-media-head">
                  <div>
                    <strong>Mídias</strong>
                    <small>
                      Arraste as mídias para reordenar. Para adicionar, clique
                      no +, solte uma imagem ou use Ctrl + V.
                    </small>
                  </div>
                  <input
                    ref={mediaInputRef}
                    type="file"
                    hidden
                    multiple
                    accept="image/png,image/jpeg,image/webp"
                    onChange={addMedia}
                  />
                </div>
                <div className="product-media-grid">
                  {media.map((item, index) => (
                    <article
                      className={`product-media-item ${item.isDeleted ? "is-deleted" : ""} ${draggedMediaIndex === index ? "is-reordering" : ""} ${mediaDropIndex === index ? "is-reorder-target" : ""}`}
                      key={`${item.id || "new"}-${index}`}
                      draggable={!item.isDeleted && !item.isNew && !saving}
                      onDragStart={(event) => {
                        if (item.isDeleted || item.isNew) return;
                        event.stopPropagation();
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData(
                          "application/x-pitter-media-index",
                          String(index),
                        );
                        setDraggedMediaIndex(index);
                      }}
                      onDragOver={(event) => {
                        if (
                          draggedMediaIndex === null ||
                          item.isDeleted ||
                          item.isNew
                        )
                          return;
                        event.preventDefault();
                        event.stopPropagation();
                        event.dataTransfer.dropEffect = "move";
                        setMediaDropIndex(index);
                      }}
                      onDrop={(event) => {
                        const raw = event.dataTransfer.getData(
                          "application/x-pitter-media-index",
                        );
                        if (!raw) return;
                        event.preventDefault();
                        event.stopPropagation();
                        const from = Number(raw);
                        if (!Number.isInteger(from) || from === index) return;
                        setMedia((current) => {
                          const next = [...current];
                          const [moved] = next.splice(from, 1);
                          next.splice(index, 0, moved);
                          return next;
                        });
                        setDraggedMediaIndex(null);
                        setMediaDropIndex(null);
                      }}
                      onDragEnd={() => {
                        setDraggedMediaIndex(null);
                        setMediaDropIndex(null);
                      }}
                    >
                      {!item.isDeleted && !item.isNew && (
                        <i
                          className="product-media-drag-handle"
                          title="Arraste para reordenar"
                        >
                          <GripVertical size={16} />
                        </i>
                      )}
                      <img src={item.url} alt={item.alt || form.title} />
                      {media.findIndex((mediaItem) => !mediaItem.isDeleted) ===
                        index && <span>Principal</span>}
                      {item.isDeleted && <em>{"Ser\u00e1 exclu\u00edda"}</em>}
                      <button
                        className={item.isDeleted ? "is-undo" : ""}
                        type="button"
                        aria-label={
                          item.isDeleted
                            ? "Desfazer exclusao"
                            : "Excluir imagem"
                        }
                        title={
                          item.isDeleted
                            ? "Desfazer exclusao"
                            : "Excluir imagem do Shopify"
                        }
                        onClick={() =>
                          item.isNew
                            ? setMedia((current) =>
                                current.filter(
                                  (_, mediaIndex) => mediaIndex !== index,
                                ),
                              )
                            : setMedia((current) =>
                                current.map((mediaItem, mediaIndex) =>
                                  mediaIndex === index
                                    ? {
                                        ...mediaItem,
                                        isDeleted: !mediaItem.isDeleted,
                                      }
                                    : mediaItem,
                                ),
                              )
                        }
                      >
                        {item.isDeleted ? (
                          <span>Desfazer</span>
                        ) : item.isNew ? (
                          <X size={14} />
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </button>
                    </article>
                  ))}
                  <button
                    className="product-media-add-tile"
                    type="button"
                    disabled={mediaLoading}
                    title="Adicionar imagem: clique, arraste ou use Ctrl + V"
                    aria-label="Adicionar imagem"
                    onClick={() => mediaInputRef.current?.click()}
                  >
                    {mediaLoading ? (
                      <LoaderCircle className="spin" size={22} />
                    ) : (
                      <>
                        <ImagePlus size={25} />
                        <strong>Adicionar mídia</strong>
                        <span>
                          Clique para selecionar ou arraste uma imagem aqui
                        </span>
                        <small>PNG, JPG ou WEBP (máx. 10MB)</small>
                      </>
                    )}
                  </button>
                </div>
              </section>
              <ChoicePicker
                label="Coleções"
                icon={<Layers3 size={18} />}
                actionLabel=""
                value={form.collections}
                options={availableCollections}
                onChange={(value) => update("collections", value)}
              />
              <ChoicePicker
                label="Tags"
                icon={<Tag size={18} />}
                actionLabel=""
                value={form.tags}
                options={availableTags}
                onChange={(value) => update("tags", value)}
              />
              <div className="product-edit-card product-weight-card">
                <span className="product-edit-card-icon">
                  <Scale size={18} />
                </span>
                <div className="product-edit-field">
                  <span>Peso</span>
                  <div className="weight-field">
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
                      onChange={(event) =>
                        update("weightUnit", event.target.value)
                      }
                    >
                      <option value="g">g</option>
                      <option value="kg">kg</option>
                    </select>
                  </div>
                </div>
              </div>
            </form>
          )}
        </div>
        {step === "edit" && (
          <footer className="product-editor-actions">
            <button
              className="btn"
              type="button"
              disabled={saving}
              onClick={() => {
                setForm(original);
                setMedia(originalMedia);
                setStep("details");
              }}
            >
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              type="submit"
              form="product-edit-form"
              disabled={saving || !totalChanges}
            >
              {saving && <LoaderCircle className="spin" size={14} />}
              {!saving && <ShoppingBag size={15} />}
              {saving ? "Salvando..." : "Salvar no Shopify"}
            </button>
          </footer>
        )}
        {successPhase !== "hidden" && (
          <div
            className={`product-success-screen ${successPhase === "leaving" ? "is-leaving" : ""}`}
            role="status"
            aria-label="Produto atualizado com sucesso"
            aria-live="polite"
          />
        )}
      </aside>
    </>
  );
}
