"use client";

import { useEffect, useState } from "react";
import { categoryInfo, fileIcon, fileKind, formatSize, type Doc } from "@/lib/docs";

type Props = {
  doc: Doc;
  /** Other saved documents with exactly the same file contents. */
  duplicates: Doc[];
  onOpenDoc: (doc: Doc) => void;
  onClose: () => void;
  onEdit: () => void;
  onDeleted: () => void;
};

export function fileUrl(doc: Doc, download = false) {
  return `/api/file?p=${encodeURIComponent(doc.pathname)}${download ? "&download=1" : ""}`;
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function ViewerSheet({ doc, duplicates, onOpenDoc, onClose, onEdit, onDeleted }: Props) {
  const kind = fileKind(doc.ext);
  const cat = categoryInfo(doc.category);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [wide, setWide] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    // Phones can't show PDFs inside the page, so they get an "Open" button instead.
    setWide(window.matchMedia("(min-width: 700px)").matches);
    setCanShare(typeof navigator.share === "function");
  }, []);

  async function share() {
    setBusy("share");
    setError("");
    try {
      const res = await fetch(fileUrl(doc));
      const blob = await res.blob();
      const file = new File([blob], `${doc.name}${doc.ext ? "." + doc.ext : ""}`, { type: blob.type });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: doc.name });
      } else {
        setError("Sharing files isn't supported on this device. Use Download instead.");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("Could not share. Please try Download.");
    }
    setBusy("");
  }

  async function remove() {
    if (!confirmDelete) return setConfirmDelete(true);
    setBusy("delete");
    const res = await fetch("/api/docs", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pathname: doc.pathname }),
    });
    if (res.ok) return onDeleted();
    setBusy("");
    setError("Could not delete. Please try again.");
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sheet-head">
          <h2>{doc.name}</h2>
          <button className="close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="preview">
          {kind === "image" ? (
            <a href={fileUrl(doc)} target="_blank" rel="noreferrer">
              <img src={fileUrl(doc)} alt={doc.name} />
            </a>
          ) : kind === "pdf" && wide ? (
            <iframe src={fileUrl(doc)} title={doc.name} />
          ) : (
            <div className="placeholder">
              <div className="big">{fileIcon(doc.ext)}</div>
              <div>
                {kind === "pdf"
                  ? "Tap “Open” to view this PDF"
                  : `No preview for ${doc.ext ? doc.ext.toUpperCase() + " files" : "this file"}. Tap “Download” to open it.`}
              </div>
            </div>
          )}
        </div>

        <dl className="details">
          <dt>Whose</dt>
          <dd>{doc.person}</dd>
          <dt>Type</dt>
          <dd>
            {cat.icon} {cat.label}
          </dd>
          <dt>Added</dt>
          <dd>{formatDate(doc.uploadedAt)}</dd>
          <dt>Size</dt>
          <dd>
            {formatSize(doc.size)} · {doc.ext.toUpperCase()}
          </dd>
        </dl>

        {duplicates.length > 0 && (
          <div className="warning">
            <div className="warning-title">⚠️ The same file is also saved as</div>
            {duplicates.map((d) => (
              <button key={d.pathname} className="dupe-link" onClick={() => onOpenDoc(d)}>
                <span className="doc-name">{d.name}</span>
                <span className="doc-meta">
                  <span className="pill">{d.person}</span>
                  <span>Added {formatDate(d.uploadedAt)}</span>
                </span>
              </button>
            ))}
            <div className="hint">If it’s an extra copy, open it and tap Delete.</div>
          </div>
        )}

        {error && <div className="error">{error}</div>}

        <div className="actions">
          {kind !== "other" && (
            <a className="btn primary" href={fileUrl(doc)} target="_blank" rel="noreferrer">
              👁️ Open
            </a>
          )}
          <a className={`btn ${kind === "other" ? "primary wide" : ""}`} href={fileUrl(doc, true)}>
            ⬇️ Download
          </a>
          {canShare && (
            <button className="btn wide" onClick={share} disabled={busy === "share"}>
              {busy === "share" ? "Preparing…" : "📤 Share (WhatsApp, Email…)"}
            </button>
          )}
          <button className="btn" onClick={onEdit}>
            ✏️ Edit
          </button>
          <button className="btn danger" onClick={remove} disabled={busy === "delete"}>
            {busy === "delete" ? "Deleting…" : confirmDelete ? "Tap again to delete" : "🗑️ Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
