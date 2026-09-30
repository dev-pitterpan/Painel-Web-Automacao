"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bold,
  Check,
  CheckCircle2,
  CircleAlert,
  ImageIcon,
  ImagePlus,
  GripVertical,
  Italic,
  List,
  ListOrdered,
  Info,
  LoaderCircle,
  Package,
  Pencil,
  Plus,
  Search,
  Scale,
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

type DrawerStep = "details" | "edit";
type SuccessPhase = "hidden" | "visible" | "leaving";
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
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
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
      <div className="choice-picker-label">
        <span>{label}</span>
        <button type="button" onClick={() => setOpen((current) => !current)}>
          <Plus size={15} />
        </button>
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
  onProductUpdated,
  canEdit = false,
}: {
  row: HistoryRow | null;
  onClose: () => void;
  onProductUpdated?: (row: HistoryRow, product: UpdatedProduct) => void;
  canEdit?: boolean;
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
  }, [activeRow]);

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

  async function openEditor(showEditor = true) {
    setLoadingProduct(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/n8n/product-editor?sku=${encodeURIComponent(activeRow!.sku)}&title=${encodeURIComponent(currentTitle(activeRow!))}`,
        { cache: "no-store" },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(body.error || "Não foi possível carregar o produto.");
      const product = body.product || {};
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
      const response = await fetch("/api/n8n/product-editor", {
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
              <div className="drawer-edit-banner">
                <div>
                  <strong>Editar informações no Shopify</strong>
                  <span>
                    {canEdit
                      ? "Carregue os valores atuais e altere título, tags, coleções e peso."
                      : "Visualização liberada. Apenas administradores podem editar produtos."}
                  </span>
                </div>
                <button
                  className={`btn btn-primary ${loadingProduct ? "is-loading" : ""}`}
                  type="button"
                  onClick={() => openEditor(true)}
                  disabled={loadingProduct || !canEdit}
                  title={
                    canEdit
                      ? "Editar informações do produto"
                      : "Apenas administradores podem editar produtos"
                  }
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
                <span>Descrição</span>
                <HtmlDescriptionEditor
                  value={form.description}
                  onChange={(html) => update("description", html)}
                />
              </label>
              <section
                className={`product-media-editor ${mediaDragging ? "is-dragging" : ""}`}
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
                      <ImagePlus size={23} />
                    )}
                  </button>
                </div>
              </section>
              <ChoicePicker
                label="Coleções"
                value={form.collections}
                options={availableCollections}
                onChange={(value) => update("collections", value)}
              />
              <ChoicePicker
                label="Tags"
                value={form.tags}
                options={availableTags}
                onChange={(value) => update("tags", value)}
              />
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
                    onChange={(event) =>
                      update("weightUnit", event.target.value)
                    }
                  >
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                  </select>
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
