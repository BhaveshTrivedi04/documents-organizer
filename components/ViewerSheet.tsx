"use client";

import { useEffect, useRef, useState } from "react";
import { categoryInfo, downloadFileName, fileIcon, fileKind, formatSize, hashFile, sameHash, type Doc } from "@/lib/docs";
import { docsApi, uploadDocument } from "@/lib/upload";

type Props = {
  doc: Doc;
  /** Other saved documents with exactly the same file contents. */
  duplicates: Doc[];
  onOpenDoc: (doc: Doc) => void;
  onClose: () => void;
  onEdit: () => void;
  /** Opens the merge screen to add more photos/files to this document. */
  onAddPages: () => void;
  /** Called after this document was deleted or replaced, with a success message. */
  onChanged: (message: string) => void;
};

export function fileUrl(doc: Doc, download = false) {
  return `/api/file?p=${encodeURIComponent(doc.pathname)}${download ? "&download=1" : ""}`;
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function ViewerSheet({ doc, duplicates, onOpenDoc, onClose, onEdit, onAddPages, onChanged }: Props) {
  const kind = fileKind(doc.ext);
  const cat = categoryInfo(doc.category);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmKeep, setConfirmKeep] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [wide, setWide] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);

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
      const file = new File([blob], downloadFileName(doc), { type: blob.type });
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

  async function keepOnlyThis() {
    if (!confirmKeep) return setConfirmKeep(true);
    setBusy("keep");
    setError("");
    try {
      for (const d of duplicates) await docsApi("DELETE", { pathname: d.pathname });
      onChanged(
        duplicates.length === 1 ? "Extra copy deleted. One copy kept." : `${duplicates.length} extra copies deleted. One copy kept.`,
      );
    } catch {
      setBusy("");
      setError("Could not delete all the copies. Please try again.");
    }
  }

  // Saves the new file under the same name, person and type, then deletes the
  // old file. The old one is only removed once the new one is safely saved.
  async function replaceWith(file: File | undefined) {
    if (!file) return;
    setError("");
    setBusy("replace");
    setProgress(0);
    try {
      const hash = await hashFile(file).catch(() => "");
      if (sameHash(hash, doc.hash)) {
        setBusy("");
        setProgress(null);
        return setError("That is the same file that is already saved here. Choose a different one.");
      }
      await uploadDocument({
        file,
        hash,
        name: doc.name,
        category: doc.category,
        person: doc.person,
        onProgress: (percentage) => setProgress(Math.round(percentage)),
      });
      await docsApi("DELETE", { pathname: doc.pathname });
      onChanged(`File replaced for ${doc.name}`);
    } catch (e) {
      setBusy("");
      setProgress(null);
      setError(`Could not replace. ${(e as Error).message || "Please check your internet and try again."}`);
    }
  }

  async function remove() {
    if (!confirmDelete) return setConfirmDelete(true);
    setBusy("delete");
    const res = await fetch("/api/docs", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pathname: doc.pathname }),
    });
    if (res.ok) return onChanged(`Deleted ${doc.name}`);
    setBusy("");
    setError("Could not delete. Please try again.");
  }

  return (
    <div className="overlay" onClick={busy === "replace" ? undefined : onClose}>
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
            <button className="btn block keep-btn" onClick={keepOnlyThis} disabled={busy === "keep"}>
              {busy === "keep"
                ? "Deleting copies…"
                : confirmKeep
                  ? `Tap again to delete ${duplicates.length === 1 ? "the other copy" : `${duplicates.length} other copies`}`
                  : "✅ Keep this one, delete the other copies"}
            </button>
          </div>
        )}

        {error && <div className="error">{error}</div>}

        {replacing && (
          <div className="warning soft">
            <div className="warning-title">🔄 Replace with a new file</div>
            <div className="hint" style={{ marginTop: 0 }}>
              The new file keeps the name {doc.name}, person {doc.person} and type {cat.label}. The old file is deleted
              after the new one is saved.
            </div>
            {busy === "replace" ? (
              <>
                <div className="progress" style={{ marginTop: 12 }} aria-label="Upload progress">
                  <div style={{ width: `${progress ?? 0}%` }} />
                </div>
                <div className="hint">Saving new file… {progress ?? 0}%</div>
              </>
            ) : (
              <div className="choice-row">
                <button className="btn small" onClick={() => cameraRef.current?.click()}>
                  📷 Take photo
                </button>
                <button className="btn small" onClick={() => filesRef.current?.click()}>
                  📄 Choose file
                </button>
                <button className="btn small" onClick={() => setReplacing(false)}>
                  Cancel
                </button>
              </div>
            )}
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                replaceWith(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <input
              ref={filesRef}
              type="file"
              hidden
              onChange={(e) => {
                replaceWith(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
        )}

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
          <button className="btn" onClick={onEdit} disabled={busy === "replace"}>
            ✏️ Edit
          </button>
          <button
            className="btn"
            onClick={() => {
              setError("");
              setReplacing(true);
            }}
            disabled={busy === "replace"}
          >
            🔄 Replace file
          </button>
          {kind !== "other" && (
            <button className="btn wide" onClick={onAddPages} disabled={busy === "replace"}>
              ➕ Add pages (e.g. back side)
            </button>
          )}
          <button className="btn danger wide" onClick={remove} disabled={busy === "delete" || busy === "replace"}>
            {busy === "delete" ? "Deleting…" : confirmDelete ? "Tap again to delete" : "🗑️ Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
