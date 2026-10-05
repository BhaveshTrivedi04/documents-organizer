"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DetailsFields from "@/components/DetailsFields";
import Icon, { FileGlyph } from "@/components/Icon";
import { fileUrl, formatDate } from "@/components/ViewerSheet";
import {
  DEFAULT_PERSON,
  categoryInfo,
  cleanName,
  fileExtension,
  fileKind,
  guessCategory,
  hashFile,
  sameDocName,
  sameHash,
  type CategoryKey,
  type Doc,
} from "@/lib/docs";
import { buildPdf, canMergeFile } from "@/lib/pdf";
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
  const [combine, setCombine] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);
  const [status, setStatus] = useState("");
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

  // Several photos/PDFs (like the front and back of a card) can become one PDF.
  const canCombine = items.length > 1 && items.every((it) => canMergeFile(it.file));
  const combining = canCombine && combine;

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
  const replacingSaved = items.filter((it, i) => contentDupes[i]?.saved && it.choice === "replace");

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

  function moveItem(index: number, by: -1 | 1) {
    const next = [...items];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    setItems(next);
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
        return onSaved(`Details updated for ${finalName}`);
      }

      if (combining) {
        setStatus("Making one PDF…");
        const pdf = await buildPdf(items.map((it) => it.file));
        setStatus("");
        await uploadDocument({
          file: pdf,
          hash: await hashFile(pdf),
          name: finalName,
          category,
          person,
          onProgress: (percentage) => setProgress(Math.round(percentage)),
        });
        // Old separate copies are now pages inside the new PDF.
        for (const it of replacingSaved) {
          const saved = contentDupes[items.indexOf(it)]?.saved;
          if (saved) await docsApi("DELETE", { pathname: saved.pathname });
        }
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
      }
      // The new file is safely saved, so the old version it replaces can go.
      for (const pathname of activeTargets) await docsApi("DELETE", { pathname });

      const replaced = activeTargets.length + replacingSaved.length > 0;
      const what = combining
        ? `${finalName} (${items.length} pages in one PDF)`
        : items.length === 1
          ? finalName
          : `${items.length} files for ${finalName}`;
      onSaved(replaced ? `Saved ${what}. Old version replaced.` : `Saved ${what}`);
    } catch (e) {
      setProgress(null);
      setStatus("");
      setError(`Could not save. ${(e as Error).message || "Please check your internet and try again."}`);
    }
  }

  const busy = progress !== null;

  let saveLabel = editing ? "Save changes" : "Save document";
  if (busy) saveLabel = status || (editing ? "Saving…" : `Saving… ${progress}%`);
  else if (checking) saveLabel = "Checking files…";
  else if (undecided > 0) saveLabel = "Choose Replace or Keep both above";
  else if (activeTargets.length > 0 || replacingSaved.length > 0) saveLabel = "Save and replace old";
  else if (combining) saveLabel = `Save as one PDF (${items.length} pages)`;

  return (
    <div className="overlay" onClick={busy ? undefined : onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sheet-head">
          <button className="round-btn" onClick={onClose} disabled={busy} aria-label="Close">
            <Icon name="back" />
          </button>
          <div className="sheet-title">
            <h2 className="serif">{editing ? "Edit details" : "New document"}</h2>
            <div className="sheet-sub">{editing ? editDoc!.name : "Photo, PDF or any file"}</div>
          </div>
        </div>

        {!editing && (
          <div className="field">
            <span className="label">1. Photo or file</span>
            <div className="pick-row">
              <button className="btn pick" onClick={() => cameraRef.current?.click()} disabled={busy}>
                <Icon name="camera" size={26} stroke={1.5} />
                {items.length > 0 ? "Take another photo" : "Take photo"}
              </button>
              <button className="btn pick" onClick={() => filesRef.current?.click()} disabled={busy}>
                <Icon name="file" size={26} stroke={1.5} />
                Choose a file
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
              <div className="files">
                {items.map((it, i) => (
                  <div className="file-cell" key={i}>
                    <div className={`file-prev ${contentDupes[i] ? "dupe" : ""}`}>
                      {it.preview ? <img src={it.preview} alt="" /> : <FileGlyph ext={fileExtension(it.file.name)} size={30} />}
                      {items.length > 1 && <span className="page-badge">{i + 1}</span>}
                      {contentDupes[i] && <span className="dupe-badge">Already saved</span>}
                      {!busy && (
                        <button className="remove" aria-label="Remove" onClick={() => removeItem(i)}>
                          <Icon name="x" size={13} stroke={2.4} />
                        </button>
                      )}
                    </div>
                    {items.length > 1 && !busy && (
                      <div className="move-row">
                        <button aria-label="Move earlier" disabled={i === 0} onClick={() => moveItem(i, -1)}>
                          <Icon name="left" size={15} />
                        </button>
                        <button
                          aria-label="Move later"
                          disabled={i === items.length - 1}
                          onClick={() => moveItem(i, 1)}
                        >
                          <Icon name="right" size={15} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {items.length === 1 && canMergeFile(items[0].file) && (
              <div className="hint">Has a back side too (like a driving licence)? Tap “Take another photo”.</div>
            )}

            {canCombine && (
              <label className="toggle">
                <input type="checkbox" checked={combine} onChange={(e) => setCombine(e.target.checked)} disabled={busy} />
                <span>
                  <strong>Combine into one PDF</strong>
                  <span className="hint">
                    {combine
                      ? `Saved as one document with ${items.length} pages, in the order above. Use the arrows to reorder.`
                      : `Saved as ${items.length} separate documents (Page 1, Page 2…).`}
                  </span>
                </span>
              </label>
            )}
            {items.length > 1 && !canCombine && (
              <div className="hint">
                {items.length} files will be saved as Page 1, Page 2… (only photos and PDFs can be combined into one PDF).
              </div>
            )}

            {contentDupes.map((dupe, i) =>
              !dupe ? null : (
                <div className="warning" key={i}>
                  <div className="warning-title">
                    <Icon name="copy" size={17} /> {items.length > 1 ? `File ${i + 1} is` : "This file is"} already saved
                  </div>
                  {dupe.saved ? (
                    <>
                      <ExistingDoc doc={dupe.saved} />
                      <a className="view-link" href={fileUrl(dupe.saved)} target="_blank" rel="noreferrer">
                        {fileKind(dupe.saved.ext) === "other" ? "Download it to check" : "View it"} →
                      </a>
                      <div className="choice-row">
                        <button
                          className={`btn small ${items[i].choice === "replace" ? "selected" : ""}`}
                          onClick={() => setChoice(i, "replace")}
                          disabled={busy}
                        >
                          <Icon name="replace" size={16} /> Replace old one
                        </button>
                        <button
                          className={`btn small ${items[i].choice === "keep" ? "selected" : ""}`}
                          onClick={() => setChoice(i, "keep")}
                          disabled={busy}
                        >
                          <Icon name="plus" size={16} /> Keep both
                        </button>
                        <button className="btn small" onClick={() => removeItem(i)} disabled={busy}>
                          <Icon name="x" size={16} /> Don’t upload
                        </button>
                      </div>
                      {items[i].choice === "replace" && (
                        <div className="hint">
                          {combining
                            ? "The old separate copy will be deleted, because it will be a page inside the new PDF."
                            : "The saved copy will be renamed to what you type below. No second copy is made."}
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

        <DetailsFields
          name={name}
          onName={changeName}
          person={person}
          onPerson={setPerson}
          category={category}
          onCategory={(c) => {
            setCategory(c);
            setCategoryTouched(true);
          }}
          persons={persons}
          disabled={busy}
          firstStep={editing ? undefined : 2}
          afterPerson={
            nameMatches.length > 0 && (
              <div className="warning soft">
                <div className="warning-title">
                  <Icon name="info" size={17} /> {finalPerson} already has{" "}
                  {nameMatches.length === 1 ? "a document" : `${nameMatches.length} documents`} with this name
                </div>
                {nameMatches.slice(0, 3).map((d) => (
                  <div className="warning-row" key={d.pathname}>
                    <ExistingDoc doc={d} />
                    <div className="row-actions">
                      <a className="btn small" href={fileUrl(d)} target="_blank" rel="noreferrer">
                        <Icon name={fileKind(d.ext) === "other" ? "download" : "eye"} size={16} /> View
                      </a>
                      {!editing && (
                        <button
                          className={`btn small ${activeTargets.includes(d.pathname) ? "selected" : ""}`}
                          onClick={() => toggleReplace(d.pathname)}
                          disabled={busy}
                        >
                          {activeTargets.includes(d.pathname) ? (
                            <>
                              <Icon name="check" size={16} /> Will replace
                            </>
                          ) : (
                            <>
                              <Icon name="replace" size={16} /> Replace
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <div className="hint">
                  {activeTargets.length > 0
                    ? "The old version will be deleted after the new one is saved."
                    : editing
                      ? "You can still save with this name. To join them into one document, use Select, then Merge, on a list of documents."
                      : "If this is a newer copy, tap Replace to delete the old one, or just save to keep both."}
                </div>
              </div>
            )
          }
        />

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

export function ExistingDoc({ doc }: { doc: Doc }) {
  const cat = categoryInfo(doc.category);
  return (
    <div className="existing">
      <div className="doc-name">{doc.name}</div>
      <div className="doc-meta">
        <span>{doc.person}</span>
        <span>{cat.label}</span>
        <span>Added {formatDate(doc.uploadedAt)}</span>
      </div>
    </div>
  );
}
