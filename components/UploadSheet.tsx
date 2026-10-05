"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fileUrl, formatDate } from "@/components/ViewerSheet";
import {
  CATEGORIES,
  DEFAULT_PERSON,
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
import { docsApi, uploadDocument } from "@/lib/upload";

type Props = {
  docs: Doc[];
  /** When set, the sheet edits this document's details instead of uploading. */
  editDoc?: Doc;
  onClose: () => void;
  /** Called with a short success message to show the user. */
  onSaved: (message: string) => void;
};

type Item = {
  file: File;
  preview: string | null;
  /** Fingerprint of the file; undefined while it is being worked out. */
  hash?: string;
  /** What to do when this exact file is already saved. */
  choice?: "replace" | "keep";
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
  /** Saved documents (same name, different file) to delete once the new upload succeeds. */
  const [replaceTargets, setReplaceTargets] = useState<string[]>([]);
  const [error, setError] = useState("");
  const cameraRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => () => itemsRef.current.forEach((it) => it.preview && URL.revokeObjectURL(it.preview)), []);

  const persons = useMemo(() => Array.from(new Set(docs.map((d) => d.person))).sort(), [docs]);
  const otherDocs = useMemo(() => docs.filter((d) => d.pathname !== editDoc?.pathname), [docs, editDoc]);

  // For each selected file: the earlier file in this same batch that is
  // identical, or else the saved document with the same contents.
  const contentDupes = items.map((it, i) => {
    const earlier = items.findIndex((other, j) => j < i && sameHash(other.hash, it.hash));
    if (earlier >= 0) return { earlier };
    const saved = otherDocs.find((d) => sameHash(d.hash, it.hash));
    return saved ? { saved } : null;
  });
  const undecided = items.filter((it, i) => contentDupes[i]?.saved && !it.choice).length;
  const checking = items.some((it) => it.hash === undefined);

  const finalPerson = cleanName(person) || DEFAULT_PERSON;
  const contentDupePaths = new Set(contentDupes.map((d) => d?.saved?.pathname).filter(Boolean));
  const nameMatches = cleanName(name)
    ? otherDocs.filter(
        (d) => d.person === finalPerson && sameDocName(d.name, name) && !contentDupePaths.has(d.pathname),
      )
    : [];
  // Only replace documents that still match what's typed now.
  const activeTargets = replaceTargets.filter((p) => nameMatches.some((d) => d.pathname === p));

  function changeName(value: string) {
    setName(value);
    if (!categoryTouched) {
      const guess = guessCategory(value);
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

  function setChoice(index: number, choice: Item["choice"]) {
    setItems(items.map((it, j) => (j === index ? { ...it, choice } : it)));
  }

  function toggleReplace(pathname: string) {
    setReplaceTargets((prev) => (prev.includes(pathname) ? prev.filter((p) => p !== pathname) : [...prev, pathname]));
  }

  function removeItem(index: number) {
    const item = items[index];
    if (item.preview) URL.revokeObjectURL(item.preview);
    setItems(items.filter((_, j) => j !== index));
  }

  async function save() {
    const finalName = cleanName(name);
    if (!finalName) return setError("Please type a name for this document, e.g. Aadhar Card.");
    if (!editing && items.length === 0) return setError("Please take a photo or choose a file first.");
    setError("");
    setProgress(0);

    try {
      if (editDoc) {
        await docsApi("PATCH", { pathname: editDoc.pathname, name: finalName, category, person });
      } else {
        for (let i = 0; i < items.length; i++) {
          const { hash, choice } = items[i];
          const docName = items.length > 1 ? `${finalName} - Page ${i + 1}` : finalName;
          const saved = contentDupes[i]?.saved;

          // Same file is already saved: just move the saved one to the new details.
          if (saved && choice === "replace") {
            await docsApi("PATCH", { pathname: saved.pathname, name: docName, category, person });
            setProgress(Math.round(((i + 1) / items.length) * 100));
            continue;
          }

          await uploadDocument({
            file: items[i].file,
            hash,
            name: docName,
            category,
            person,
            onProgress: (percentage) => setProgress(Math.round(((i + percentage / 100) / items.length) * 100)),
          });
        }
        // The new file is safely saved, so the old version it replaces can go.
        for (const pathname of activeTargets) await docsApi("DELETE", { pathname });
      }
      if (editDoc) onSaved(`Details updated for ${finalName}`);
      else {
        const replaced = activeTargets.length + items.filter((it, i) => contentDupes[i]?.saved && it.choice === "replace").length;
        const what = items.length === 1 ? finalName : `${items.length} files for ${finalName}`;
        onSaved(replaced > 0 ? `Saved ${what}. Old version replaced.` : `Saved ${what}`);
      }
    } catch (e) {
      setProgress(null);
      setError(`Could not save. ${(e as Error).message || "Please check your internet and try again."}`);
    }
  }

  const busy = progress !== null;
  const personChoices = Array.from(new Set([DEFAULT_PERSON, ...persons])).filter(Boolean);

  let saveLabel = editing ? "Save changes" : "Save document";
  if (busy) saveLabel = editing ? "Saving…" : `Saving… ${progress}%`;
  else if (checking) saveLabel = "Checking files…";
  else if (undecided > 0) saveLabel = "Choose Replace or Keep both above";
  else if (activeTargets.length > 0 || items.some((it, i) => contentDupes[i]?.saved && it.choice === "replace"))
    saveLabel = "Save and replace old";

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
                    {items.length} files will be saved as Page 1, Page 2… (e.g. front and back).
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
                      <a className="view-link" href={fileUrl(dupe.saved)} target="_blank" rel="noreferrer">
                        {fileKind(dupe.saved.ext) === "other" ? "⬇️ Download it to check" : "👁️ View it"}
                      </a>
                      <div className="choice-row">
                        <button
                          className={`btn small ${items[i].choice === "replace" ? "selected" : ""}`}
                          onClick={() => setChoice(i, "replace")}
                          disabled={busy}
                        >
                          🔁 Replace old one
                        </button>
                        <button
                          className={`btn small ${items[i].choice === "keep" ? "selected" : ""}`}
                          onClick={() => setChoice(i, "keep")}
                          disabled={busy}
                        >
                          ➕ Keep both
                        </button>
                        <button className="btn small" onClick={() => removeItem(i)} disabled={busy}>
                          ✕ Don’t upload
                        </button>
                      </div>
                      {items[i].choice === "replace" && (
                        <div className="hint">
                          The saved copy will be renamed to what you type below. No second copy is made.
                        </div>
                      )}
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
            className="input"
            placeholder="e.g. Vyom Aadhar Card"
            value={name}
            onChange={(e) => changeName(e.target.value)}
            autoCapitalize="words"
            autoComplete="off"
            disabled={busy}
          />
          {cleanName(name) && cleanName(name) !== name.trim() && (
            <div className="hint">
              Will be saved as <strong>{cleanName(name)}</strong>
            </div>
          )}
        </div>

        <div className="field">
          <span className="label">{editing ? "Whose document?" : "3. Whose document?"}</span>
          <input
            className="input"
            placeholder="Select from below or type new"
            value={person}
            onChange={(e) => setPerson(e.target.value)}
            autoCapitalize="words"
            autoComplete="off"
            disabled={busy}
          />
          {cleanName(person) && cleanName(person) !== person.trim() && (
            <div className="hint">
              Will be saved as <strong>{cleanName(person)}</strong>
            </div>
          )}
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
                <div className="row-actions">
                  <a className="btn small" href={fileUrl(d)} target="_blank" rel="noreferrer">
                    {fileKind(d.ext) === "other" ? "⬇️" : "👁️"} View
                  </a>
                  {!editing && (
                    <button
                      className={`btn small ${activeTargets.includes(d.pathname) ? "selected" : ""}`}
                      onClick={() => toggleReplace(d.pathname)}
                      disabled={busy}
                    >
                      {activeTargets.includes(d.pathname) ? "✓ Will replace" : "🔁 Replace"}
                    </button>
                  )}
                </div>
              </div>
            ))}
            <div className="hint">
              {activeTargets.length > 0
                ? "The old version will be deleted after the new one is saved."
                : editing
                  ? "You can still save with this name."
                  : "If this is a newer copy, tap Replace to delete the old one, or just save to keep both."}
            </div>
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

        <button className="btn primary block" onClick={save} disabled={busy || checking || undecided > 0}>
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
