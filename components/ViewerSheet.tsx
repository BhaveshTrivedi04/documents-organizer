"use client";

import { useEffect, useRef, useState } from "react";
import Icon, { FileGlyph } from "@/components/Icon";
import LazyImage from "@/components/LazyImage";
import { categoryInfo, downloadFileName, fileKind, formatSize, hashFile, sameHash, type Doc } from "@/lib/docs";
import { downloadDoc, fileUrl } from "@/lib/files";
import { docsApi, uploadDocument } from "@/lib/upload";

type Props = {
  doc: Doc;
  /** Other saved documents with exactly the same file contents. */
  duplicates: Doc[];
  onOpenDoc: (doc: Doc) => void;
  /** Shows the photo or PDF full screen inside the app. */
  onPreview: (doc: Doc) => void;
  onClose: () => void;
  onEdit: () => void;
  /** Opens the merge screen to add more photos/files to this document. */
  onAddPages: () => void;
  /** Called after this document was deleted or replaced, with a success message. */
  onChanged: (message: string) => void;
};

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function ViewerSheet({ doc, duplicates, onOpenDoc, onPreview, onClose, onEdit, onAddPages, onChanged }: Props) {
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

  async function download() {
    setBusy("download");
    setError("");
    try {
      await downloadDoc(doc);
    } catch (e) {
      setError((e as Error).message);
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
          <button className="round-btn" onClick={onClose} aria-label="Close" disabled={busy === "replace"}>
            <Icon name="back" />
          </button>
          <div className="sheet-title">
            <h2 className="serif">{doc.name}</h2>
            <div className="sheet-sub">
              <span>
                <Icon name="file" size={14} /> {doc.ext.toUpperCase() || "File"} · {formatSize(doc.size)}
              </span>
            </div>
          </div>
        </div>

        <div className="paper">
          {kind === "image" ? (
            <button className="paper-btn" onClick={() => onPreview(doc)} aria-label="View full screen">
              <LazyImage src={fileUrl(doc)} alt={doc.name} showLabel />
            </button>
          ) : kind === "pdf" && wide ? (
            <iframe src={fileUrl(doc)} title={doc.name} />
          ) : kind === "pdf" ? (
            <button className="placeholder paper-btn" onClick={() => onPreview(doc)}>
              <FileGlyph ext={doc.ext} size={54} />
              <div>Tap to read this PDF</div>
            </button>
          ) : (
            <div className="placeholder">
              <FileGlyph ext={doc.ext} size={54} />
              <div>{`No preview for ${doc.ext ? doc.ext.toUpperCase() + " files" : "this file"}. Tap Download to open it.`}</div>
            </div>
          )}
        </div>

        <dl className="details">
          <div>
            <dt>Whose</dt>
            <dd>{doc.person}</dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{cat.label}</dd>
          </div>
          <div>
            <dt>Added</dt>
            <dd>{formatDate(doc.uploadedAt)}</dd>
          </div>
        </dl>

        {duplicates.length > 0 && (
          <div className="warning">
            <div className="warning-title">
              <Icon name="copy" size={17} /> Also saved as
            </div>
            {duplicates.map((d) => (
              <button key={d.pathname} className="dupe-link" onClick={() => onOpenDoc(d)}>
                <span className="doc-name">{d.name}</span>
                <span className="doc-meta">
                  {d.person} · {formatDate(d.uploadedAt)}
                </span>
              </button>
            ))}
            <button className="btn block keep-btn" onClick={keepOnlyThis} disabled={busy === "keep"}>
              {busy === "keep"
                ? "Deleting copies…"
                : confirmKeep
                  ? `Tap again to delete ${duplicates.length === 1 ? "the other copy" : `${duplicates.length} other copies`}`
                  : "Keep this one, delete the other copies"}
            </button>
          </div>
        )}

        {error && <div className="error">{error}</div>}

        {replacing && (
          <div className="panel">
            <div className="panel-title">
              <Icon name="replace" size={17} /> Replace with a new file
            </div>
            <div className="hint" style={{ marginTop: 0 }}>
              Keeps the name, person and category. The old file is deleted once the new one is saved.
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
                  <Icon name="camera" size={17} /> Take photo
                </button>
                <button className="btn small" onClick={() => filesRef.current?.click()}>
                  <Icon name="file" size={17} /> Choose file
                </button>
                <button className="btn small ghost" onClick={() => setReplacing(false)}>
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
            <button className="btn primary" onClick={() => onPreview(doc)}>
              <Icon name="eye" size={18} /> Open
            </button>
          )}
          <button className={`btn ${kind === "other" ? "primary wide" : ""}`} onClick={download} disabled={busy === "download"}>
            <Icon name="download" size={18} /> {busy === "download" ? "Downloading…" : "Download"}
          </button>
          {canShare && (
            <button className="btn wide" onClick={share} disabled={busy === "share"}>
              <Icon name="share" size={18} /> {busy === "share" ? "Preparing…" : "Share on WhatsApp, Email…"}
            </button>
          )}
        </div>

        <div className="quick-actions">
          <button className="quick" onClick={onEdit} disabled={busy === "replace"}>
            <Icon name="edit" size={18} />
            <span>Edit</span>
          </button>
          {kind !== "other" && (
            <button className="quick" onClick={onAddPages} disabled={busy === "replace"}>
              <Icon name="filePlus" size={18} />
              <span>Add pages</span>
            </button>
          )}
          <button
            className="quick"
            onClick={() => {
              setError("");
              setReplacing(true);
            }}
            disabled={busy === "replace"}
          >
            <Icon name="replace" size={18} />
            <span>Replace</span>
          </button>
          <button
            className={`quick danger ${confirmDelete ? "confirm" : ""}`}
            onClick={remove}
            disabled={busy === "delete" || busy === "replace"}
          >
            <Icon name="trash" size={18} />
            <span>{busy === "delete" ? "Deleting…" : confirmDelete ? "Tap again" : "Delete"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
