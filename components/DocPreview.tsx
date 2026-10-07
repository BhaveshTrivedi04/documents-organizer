"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Icon, { FileGlyph } from "@/components/Icon";
import { fileKind, formatSize, type Doc } from "@/lib/docs";
import { downloadDoc, fileUrl } from "@/lib/files";

type Props = {
  doc: Doc;
  onClose: () => void;
};

const MAX_ZOOM = 4;
// One pdf.js worker for the whole visit, started the first time a PDF is opened.
let pdfWorker: Worker | null = null;
const MAX_PDF_PAGES = 60;

/**
 * Full-screen view of a photo or PDF inside the app, with a back button.
 * Pinch or double-tap to zoom, drag to move around.
 */
export default function DocPreview({ doc, onClose }: Props) {
  const kind = fileKind(doc.ext);
  const bodyRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  // Width (px) of the content at zoom 1, and its height/width ratio.
  const [fit, setFit] = useState<{ width: number; ratio: number } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [pageCount, setPageCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Close with Escape on a computer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Stop the page behind from scrolling.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  /** Sets the zoom, keeping the point under (x, y) of the screen in place. */
  function applyZoom(next: number, x?: number, y?: number) {
    const body = bodyRef.current;
    const content = contentRef.current;
    if (!body || !content || !fit) return;
    const zoom = Math.min(MAX_ZOOM, Math.max(1, next));
    const rect = body.getBoundingClientRect();
    const px = (x ?? rect.left + rect.width / 2) - rect.left;
    const py = (y ?? rect.top + rect.height / 2) - rect.top;
    const contentX = (body.scrollLeft + px) / zoomRef.current;
    const contentY = (body.scrollTop + py) / zoomRef.current;
    zoomRef.current = zoom;
    content.style.width = `${fit.width * zoom}px`;
    body.scrollLeft = contentX * zoom - px;
    body.scrollTop = contentY * zoom - py;
  }

  // Works out the size that fits the screen (photos fit whole; PDFs fit the width).
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body || !fit) return;
    const content = contentRef.current!;
    content.style.width = `${fit.width * zoomRef.current}px`;
  }, [fit]);

  function measureImage(img: HTMLImageElement) {
    const body = bodyRef.current;
    if (!body) return;
    const ratio = img.naturalHeight / img.naturalWidth;
    const width = Math.min(body.clientWidth - 24, (body.clientHeight - 24) / ratio);
    setFit({ width: Math.max(80, width), ratio });
    setStatus("ready");
  }

  // Pinch to zoom and double-tap, handled here so the rest of the app doesn't zoom.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    let start: { dist: number; zoom: number } | null = null;
    let lastTap = 0;
    let moved = false;

    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = (t: TouchList) => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2];

    const onStart = (e: TouchEvent) => {
      moved = false;
      if (e.touches.length === 2) start = { dist: dist(e.touches), zoom: zoomRef.current };
    };
    const onMove = (e: TouchEvent) => {
      moved = true;
      if (e.touches.length === 2 && start) {
        e.preventDefault();
        const [x, y] = mid(e.touches);
        applyZoom((start.zoom * dist(e.touches)) / start.dist, x, y);
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) start = null;
      if (e.touches.length > 0 || moved || e.changedTouches.length !== 1) return;
      const now = Date.now();
      if (now - lastTap < 300) {
        const t = e.changedTouches[0];
        applyZoom(zoomRef.current > 1.05 ? 1 : 2.5, t.clientX, t.clientY);
        lastTap = 0;
      } else lastTap = now;
    };
    const onDouble = (e: MouseEvent) => applyZoom(zoomRef.current > 1.05 ? 1 : 2.5, e.clientX, e.clientY);

    body.addEventListener("touchstart", onStart, { passive: true });
    body.addEventListener("touchmove", onMove, { passive: false });
    body.addEventListener("touchend", onEnd);
    body.addEventListener("dblclick", onDouble);
    return () => {
      body.removeEventListener("touchstart", onStart);
      body.removeEventListener("touchmove", onMove);
      body.removeEventListener("touchend", onEnd);
      body.removeEventListener("dblclick", onDouble);
    };
    // applyZoom reads the latest `fit` through this effect re-running.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit]);

  // PDFs: draw every page with pdf.js (phones can't show PDFs inside a page).
  useEffect(() => {
    if (kind !== "pdf") return;
    let cancelled = false;
    let task: { destroy: () => Promise<void> } | null = null;

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfWorker ??= new Worker(new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url), {
          type: "module",
        });
        pdfjs.GlobalWorkerOptions.workerPort = pdfWorker;
        const loading = pdfjs.getDocument({ url: fileUrl(doc) });
        task = loading;
        const pdf = await loading.promise;
        if (cancelled) return;
        const body = bodyRef.current!;
        const width = Math.min(body.clientWidth - 24, 900);
        const first = await pdf.getPage(1);
        const firstView = first.getViewport({ scale: 1 });
        setFit({ width, ratio: firstView.height / firstView.width });
        const count = Math.min(pdf.numPages, MAX_PDF_PAGES);
        setPageCount(pdf.numPages);

        const holder = contentRef.current!;
        // Sharp enough to zoom in a bit, without huge images on old phones.
        const pixelWidth = Math.min(2400, width * Math.min(window.devicePixelRatio || 1, 2) * 2);
        for (let n = 1; n <= count; n++) {
          if (cancelled) return;
          const page = n === 1 ? first : await pdf.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: pixelWidth / base.width });
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          canvas.className = "preview-page";
          canvas.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
          holder.appendChild(canvas);
          await page.render({ canvas, viewport }).promise;
          if (n === 1) setStatus("ready");
        }
      } catch (e) {
        if (!cancelled) {
          console.error(e);
          setStatus("error");
        }
      }
    })();

    const holder = contentRef.current;
    return () => {
      cancelled = true;
      task?.destroy().catch(() => {});
      holder?.replaceChildren();
    };
  }, [doc, kind]);

  async function download() {
    setBusy(true);
    setError("");
    try {
      await downloadDoc(doc);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <div className="preview" role="dialog" aria-modal="true" aria-label={doc.name}>
      <div className="preview-bar">
        <button className="round-btn" onClick={onClose} aria-label="Back">
          <Icon name="back" />
        </button>
        <div className="preview-title">
          <div className="preview-name">{doc.name}</div>
          <div className="preview-meta">
            {doc.ext.toUpperCase() || "File"} · {formatSize(doc.size)}
            {pageCount > 1 && ` · ${pageCount} pages`}
          </div>
        </div>
        <button className="round-btn" onClick={download} disabled={busy} aria-label="Download">
          <Icon name="download" size={19} />
        </button>
      </div>

      {error && <div className="error preview-error">{error}</div>}

      <div className={`preview-body ${kind}`} ref={bodyRef}>
        {kind === "other" || status === "error" ? (
          <div className="preview-empty">
            <FileGlyph ext={doc.ext} size={56} />
            <p>
              {status === "error"
                ? "This file can't be shown here."
                : `No preview for ${doc.ext ? doc.ext.toUpperCase() + " files" : "this file"}.`}{" "}
              Download it to open it in another app.
            </p>
            <button className="btn primary" onClick={download} disabled={busy}>
              <Icon name="download" size={18} /> {busy ? "Downloading…" : "Download"}
            </button>
          </div>
        ) : (
          <div className="preview-stage">
            <div className="preview-content" ref={contentRef} style={fit ? undefined : { width: "100%" }}>
              {kind === "image" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={fileUrl(doc)}
                  alt={doc.name}
                  draggable={false}
                  onLoad={(e) => measureImage(e.currentTarget)}
                  onError={() => setStatus("error")}
                />
              )}
            </div>
            {status === "loading" && (
              <div className="preview-loading">
                <span className="spinner" /> Loading…
              </div>
            )}
          </div>
        )}
      </div>
      {status === "ready" && <div className="preview-hint">Pinch or double-tap to zoom</div>}
    </div>
  );
}
