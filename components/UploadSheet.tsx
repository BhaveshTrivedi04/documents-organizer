"use client";

import { upload } from "@vercel/blob/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { fileUrl, formatDate } from "@/components/ViewerSheet";
import { compressImage } from "@/lib/compress";
import {
  CATEGORIES,
  DEFAULT_PERSON,
  buildPathname,
  categoryInfo,
  cleanName,
  fileExtension,
  fileIcon,
  fileKind,
  guessCategory,
  hashFile,
  sameDocName,
  sameHash,
  type CategoryKey,
  type Doc,
} from "@/lib/docs";

type Props = {
  docs: Doc[];
  /** When set, the sheet edits this document's details instead of uploading. */
  editDoc?: Doc;
  onClose: () => void;
  onSaved: () => void;
};

type Item = {
  file: File;
  preview: string | null;
  /** Fingerprint of the file; undefined while it is being worked out. */
  hash?: string;
};

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
};

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

// Camera and WhatsApp names like "IMG_20240105_1234" aren't useful as document names.
function looksAutoNamed(name: string) {
  return /^(IMG|PXL|DSC|VID|PHOTO|SCREENSHOT|WHATSAPP|SCAN|DOC|IMAGE|CAMSCANNER)\b|^\d|^[A-F0-9-]{20,}$/i.test(
    name.replace(/_/g, " "),
  );
}

export default function UploadSheet({ docs, editDoc, onClose, onSaved }: Props) {
  const editing = Boolean(editDoc);
  const [items, setItems] = useState<Item[]>([]);
  const [name, setName] = useState(editDoc?.name ?? "");
  const [category, setCategory] = useState<CategoryKey>(editDoc?.category ?? "OTHER");
  const [categoryTouched, setCategoryTouched] = useState(editing);
  const [person, setPerson] = useState(editDoc?.person === DEFAULT_PERSON ? "" : (editDoc?.person ?? ""));
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const cameraRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => () => itemsRef.current.forEach((it) => it.preview && URL.revokeObjectURL(it.preview)), []);

  const persons = useMemo(() => Array.from(new Set(docs.map((d) => d.person))).sort(), [docs]);
  const otherDocs = useMemo(() => docs.filter((d) => d.pathname !== editDoc?.pathname), [docs, editDoc]);

  // For each selected file: the saved document with the same contents, or the
  // earlier file in this same batch that is identical.
  const contentDupes = items.map((it, i) => {
    const saved = otherDocs.find((d) => sameHash(d.hash, it.hash));
    if (saved) return { saved };
    const earlier = items.findIndex((other, j) => j < i && sameHash(other.hash, it.hash));
    return earlier >= 0 ? { earlier } : null;
  });
  const dupeCount = contentDupes.filter(Boolean).length;
  const checking = items.some((it) => it.hash === undefined);

  const finalPerson = cleanName(person) || DEFAULT_PERSON;
  const nameMatches = cleanName(name)
    ? otherDocs.filter((d) => d.person === finalPerson && sameDocName(d.name, name))
    : [];

  function changeName(value: string) {
    const upper = value.toUpperCase();
    setName(upper);
    if (!categoryTouched) {
      const guess = guessCategory(upper);
      if (guess) setCategory(guess);
    }
  }

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const added: Item[] = Array.from(list).map((file) => ({
      file,
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
    }));
    setItems((prev) => [...prev, ...added]);
    for (const item of added) {
      hashFile(item.file)
        .catch(() => "")
        .then((hash) => setItems((prev) => prev.map((it) => (it === item ? { ...it, hash } : it))));
    }
    if (!name) {
      const base = added[0].file.name.replace(/\.[^.]+$/, "");
      if (!looksAutoNamed(base)) changeName(cleanName(base));
    }
  }

  function removeItem(index: number) {
    const item = items[index];
    if (item.preview) URL.revokeObjectURL(item.preview);
    setItems(items.filter((_, j) => j !== index));
  }

  async function save() {
    const finalName = cleanName(name);
    if (!finalName) return setError("Please type a name for this document, e.g. AADHAR CARD.");
    if (!editing && items.length === 0) return setError("Please take a photo or choose a file first.");
    setError("");
    setProgress(0);

    try {
      if (editDoc) {
        const res = await fetch("/api/docs", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pathname: editDoc.pathname, name: finalName, category, person }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not save");
      } else {
        for (let i = 0; i < items.length; i++) {
          const { hash } = items[i];
          const file = await compressImage(items[i].file);
          const ext = fileExtension(file.name) || EXT_BY_MIME[file.type] || "";
          const docName = items.length > 1 ? `${finalName} - PAGE ${i + 1}` : finalName;
          const pathname = buildPathname({ name: docName, category, person, ext, hash });
          await upload(pathname, file, {
            access: "private",
            handleUploadUrl: "/api/upload",
            contentType: file.type || MIME_BY_EXT[ext] || "application/octet-stream",
            multipart: file.size > 8 * 1024 * 1024,
            onUploadProgress: ({ percentage }) =>
              setProgress(Math.round(((i + percentage / 100) / items.length) * 100)),
          });
        }
      }
      onSaved();
    } catch (e) {
      setProgress(null);
      setError(`Could not save. ${(e as Error).message || "Please check your internet and try again."}`);
    }
  }

  const busy = progress !== null;
  const personChoices = Array.from(new Set([DEFAULT_PERSON, ...persons])).filter(Boolean);

  let saveLabel = editing ? "Save changes" : "Save document";
  if (busy) saveLabel = editing ? "Saving…" : `Uploading… ${progress}%`;
  else if (checking) saveLabel = "Checking files…";
  else if (dupeCount > 0) saveLabel = "Save anyway (keep a second copy)";

  return (
    <div className="overlay" onClick={busy ? undefined : onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sheet-head">
          <h2>{editing ? "Edit details" : "Add a document"}</h2>
          <button className="close" onClick={onClose} disabled={busy} aria-label="Close">
            ✕
          </button>
        </div>

        {!editing && (
          <div className="field">
            <span className="label">1. Photo or file</span>
            <div className="pick-row">
              <button className="btn pick" onClick={() => cameraRef.current?.click()} disabled={busy}>
                <span className="emoji">📷</span>Take photo
              </button>
              <button className="btn pick" onClick={() => filesRef.current?.click()} disabled={busy}>
                <span className="emoji">📄</span>Choose any file
              </button>
            </div>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={filesRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            {items.length > 0 && (
              <>
                <div className="files">
                  {items.map((it, i) => (
                    <div className={`file-prev ${contentDupes[i] ? "dupe" : ""}`} key={i}>
                      {it.preview ? <img src={it.preview} alt="" /> : fileIcon(fileExtension(it.file.name))}
                      {contentDupes[i] && <span className="dupe-badge">Already saved</span>}
                      {!busy && (
                        <button className="remove" aria-label="Remove" onClick={() => removeItem(i)}>
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {items.length > 1 && (
                  <div className="hint">
                    {items.length} files will be saved as PAGE 1, PAGE 2… (e.g. front and back).
                  </div>
                )}
              </>
            )}

            {contentDupes.map((dupe, i) =>
              !dupe ? null : (
                <div className="warning" key={i}>
                  <div className="warning-title">⚠️ This file is already saved</div>
                  {dupe.saved ? (
                    <>
                      <ExistingDoc doc={dupe.saved} />
                      <div className="warning-actions">
                        <a className="btn small" href={fileUrl(dupe.saved)} target="_blank" rel="noreferrer">
                          {fileKind(dupe.saved.ext) === "other" ? "⬇️ Download it" : "👁️ View it"}
                        </a>
                        <button className="btn small" onClick={() => removeItem(i)} disabled={busy}>
                          Don’t upload this
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="hint">You picked the same file twice (file {dupe.earlier! + 1} and {i + 1}).</div>
                      <div className="warning-actions">
                        <button className="btn small" onClick={() => removeItem(i)} disabled={busy}>
                          Remove the extra copy
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ),
            )}
          </div>
        )}

        <div className="field">
          <label className="label" htmlFor="doc-name">
            {editing ? "Name" : "2. Name"}
          </label>
          <input
            id="doc-name"
            className="input caps"
            placeholder="e.g. AADHAR CARD"
            value={name}
            onChange={(e) => changeName(e.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            disabled={busy}
          />
        </div>

        <div className="field">
          <span className="label">{editing ? "Whose document?" : "3. Whose document?"}</span>
          <input
            className="input caps"
            placeholder="e.g. MOM, DAD, VYOM"
            value={person}
            onChange={(e) => setPerson(e.target.value.toUpperCase())}
            autoCapitalize="characters"
            autoComplete="off"
            disabled={busy}
          />
          <div className="chip-wrap">
            {personChoices.map((p) => (
              <button
                key={p}
                className={`chip small ${finalPerson === p ? "active" : ""}`}
                onClick={() => setPerson(p === DEFAULT_PERSON ? "" : p)}
                disabled={busy}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {nameMatches.length > 0 && (
          <div className="warning soft">
            <div className="warning-title">
              ℹ️ {finalPerson} already has {nameMatches.length === 1 ? "a document" : `${nameMatches.length} documents`}{" "}
              with this name
            </div>
            {nameMatches.slice(0, 3).map((d) => (
              <div className="warning-row" key={d.pathname}>
                <ExistingDoc doc={d} />
                <a className="btn small" href={fileUrl(d)} target="_blank" rel="noreferrer">
                  {fileKind(d.ext) === "other" ? "⬇️" : "👁️"} View
                </a>
              </div>
            ))}
            <div className="hint">If this is a newer copy, you can still save it.</div>
          </div>
        )}

        <div className="field">
          <span className="label">{editing ? "Type" : "4. Type"}</span>
          <div className="cat-grid">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                className={`cat-btn ${category === c.key ? "active" : ""}`}
                onClick={() => {
                  setCategory(c.key);
                  setCategoryTouched(true);
                }}
                disabled={busy}
              >
                <span className="emoji">{c.icon}</span>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="error">{error}</div>}
        {busy && !editing && (
          <div className="progress" aria-label="Upload progress">
            <div style={{ width: `${progress}%` }} />
          </div>
        )}

        <button className="btn primary block" onClick={save} disabled={busy || checking}>
          {saveLabel}
        </button>
      </div>
    </div>
  );
}

function ExistingDoc({ doc }: { doc: Doc }) {
  const cat = categoryInfo(doc.category);
  return (
    <div className="existing">
      <div className="doc-name">{doc.name}</div>
      <div className="doc-meta">
        <span className="pill">{doc.person}</span>
        <span>
          {cat.icon} {cat.label}
        </span>
        <span>Added {formatDate(doc.uploadedAt)}</span>
      </div>
    </div>
  );
}
