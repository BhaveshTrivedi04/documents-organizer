"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DetailsFields from "@/components/DetailsFields";
import Icon, { FileGlyph } from "@/components/Icon";
import LazyImage from "@/components/LazyImage";
import { fileUrl } from "@/components/ViewerSheet";
import {
  DEFAULT_PERSON,
  cleanName,
  fileExtension,
  fileKind,
  hashFile,
  type CategoryKey,
  type Doc,
} from "@/lib/docs";
import { buildPdf, canMergeFile, fetchDocFile } from "@/lib/pdf";
import { docsApi, uploadDocument } from "@/lib/upload";

type Props = {
  docs: Doc[];
  /** Saved documents to merge, in the order they were picked. */
  initial: Doc[];
  /** "Add pages" mode: this document gets the new pages and is replaced by the result. */
  base?: Doc;
  onClose: () => void;
  onSaved: (message: string) => void;
};

/** One page source: a saved document or a new photo/file from the phone. */
type Part = { key: string; doc?: Doc; file?: File; preview?: string | null };

let nextKey = 0;

export default function MergeSheet({ docs, initial, base, onClose, onSaved }: Props) {
  const first = base ?? initial[0];
  const [parts, setParts] = useState<Part[]>(() => initial.map((doc) => ({ key: `k${nextKey++}`, doc })));
  const [name, setName] = useState(base ? base.name : (first?.name ?? "").replace(/ - Page \d+$/i, ""));
  const [person, setPerson] = useState(first?.person === DEFAULT_PERSON ? "" : (first?.person ?? ""));
  const [category, setCategory] = useState<CategoryKey>(first?.category ?? "OTHER");
  const [deleteOriginals, setDeleteOriginals] = useState(true);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const cameraRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const partsRef = useRef(parts);
  partsRef.current = parts;

  useEffect(() => () => partsRef.current.forEach((p) => p.preview && URL.revokeObjectURL(p.preview)), []);

  const persons = useMemo(() => Array.from(new Set(docs.map((d) => d.person))).sort(), [docs]);
  const savedParts = parts.filter((p) => p.doc);
  const busy = progress !== null;

  function addFiles(list: FileList | null) {
    if (!list) return;
    const files = Array.from(list);
    const bad = files.filter((f) => !canMergeFile(f));
    if (bad.length) setError("Only photos and PDFs can be added as pages.");
    else setError("");
    const added = files.filter(canMergeFile).map((file) => ({
      key: `k${nextKey++}`,
      file,
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
    }));
    setParts((prev) => [...prev, ...added]);
  }

  function move(index: number, by: -1 | 1) {
    const next = [...parts];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    setParts(next);
  }

  function remove(index: number) {
    const part = parts[index];
    if (part.preview) URL.revokeObjectURL(part.preview);
    setParts(parts.filter((_, j) => j !== index));
  }

  async function save() {
    const finalName = cleanName(name);
    if (!finalName) return setError("Please type a name for the merged document.");
    if (parts.length < 2) return setError("Add at least two pages.");
    setError("");
    setProgress(0);
    try {
      setStatus("Getting the pages…");
      const blobs: Blob[] = [];
      for (const part of parts) blobs.push(part.file ?? (await fetchDocFile(fileUrl(part.doc!))));

      setStatus("Making one PDF…");
      const pdf = await buildPdf(blobs);

      setStatus("");
      await uploadDocument({
        file: pdf,
        hash: await hashFile(pdf),
        name: finalName,
        category,
        person,
        onProgress: (percentage) => setProgress(Math.round(percentage)),
      });

      // The new PDF is safely saved; now remove the separate originals.
      if (base || deleteOriginals) {
        setStatus("Tidying up…");
        for (const part of savedParts) await docsApi("DELETE", { pathname: part.doc!.pathname });
      }

      onSaved(
        base ? `Pages added to ${finalName}` : `Merged ${parts.length} documents into ${finalName}`,
      );
    } catch (e) {
      setProgress(null);
      setStatus("");
      setError(`Could not merge. ${(e as Error).message || "Please check your internet and try again."}`);
    }
  }

  let saveLabel = base ? "Save with new pages" : `Merge into one PDF (${parts.length} pages)`;
  if (busy) saveLabel = status || `Saving… ${progress}%`;
  else if (parts.length < 2) saveLabel = base ? "Add a photo or file above" : "Add at least two pages";

  return (
    <div className="overlay" onClick={busy ? undefined : onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sheet-head">
          <button className="round-btn" onClick={onClose} disabled={busy} aria-label="Close">
            <Icon name="back" />
          </button>
          <div className="sheet-title">
            <h2 className="serif">{base ? "Add pages" : "Merge documents"}</h2>
            <div className="sheet-sub">{base ? base.name : "Join them into one PDF"}</div>
          </div>
        </div>

        <div className="field">
          <span className="label">Pages, in order</span>
          <div className="page-list">
            {parts.map((part, i) => (
              <div className="page-row" key={part.key}>
                <span className="page-num">{i + 1}</span>
                <div className="thumb small">
                  {part.doc ? (
                    fileKind(part.doc.ext) === "image" ? (
                      <LazyImage src={fileUrl(part.doc)} fallback={<FileGlyph ext={part.doc.ext} size={22} />} />
                    ) : (
                      <FileGlyph ext={part.doc.ext} size={22} />
                    )
                  ) : part.preview ? (
                    <img src={part.preview} alt="" />
                  ) : (
                    <FileGlyph ext={fileExtension(part.file!.name)} size={22} />
                  )}
                </div>
                <div className="page-label">
                  <div className="doc-name">{part.doc ? part.doc.name : "New page"}</div>
                  <div className="doc-meta">
                    {part.doc ? (
                      <span>{part.doc.person}</span>
                    ) : (
                      <span>{part.file!.type === "application/pdf" ? "PDF from phone" : "Photo from phone"}</span>
                    )}
                    {part.doc?.ext === "pdf" && <span>all its pages</span>}
                  </div>
                </div>
                {!busy && (
                  <div className="page-actions">
                    <button aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                      <Icon name="up" size={16} />
                    </button>
                    <button aria-label="Move down" disabled={i === parts.length - 1} onClick={() => move(i, 1)}>
                      <Icon name="down" size={16} />
                    </button>
                    {!(base && part.doc) && (
                      <button aria-label="Remove page" onClick={() => remove(i)}>
                        <Icon name="x" size={16} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="pick-row" style={{ marginTop: 10 }}>
            <button className="btn small" onClick={() => cameraRef.current?.click()} disabled={busy}>
              <Icon name="camera" size={17} /> Add photo
            </button>
            <button className="btn small" onClick={() => filesRef.current?.click()} disabled={busy}>
              <Icon name="file" size={17} /> Add file
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
            accept="image/*,application/pdf"
            multiple
            hidden
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <div className="hint">Use the arrows to put the pages in order (e.g. front first, then back).</div>
        </div>

        <DetailsFields
          name={name}
          onName={setName}
          person={person}
          onPerson={setPerson}
          category={category}
          onCategory={setCategory}
          persons={persons}
          disabled={busy}
        />

        {base ? (
          <div className="hint" style={{ marginBottom: 14 }}>
            The old file is replaced by the new PDF once it is saved.
          </div>
        ) : (
          savedParts.length > 0 && (
            <label className="toggle">
              <input
                type="checkbox"
                checked={deleteOriginals}
                onChange={(e) => setDeleteOriginals(e.target.checked)}
                disabled={busy}
              />
              <span>
                <strong>Delete the separate documents after merging</strong>
                <span className="hint">
                  {deleteOriginals
                    ? `The ${savedParts.length} separate documents are removed once the merged PDF is saved.`
                    : "The separate documents are kept as well."}
                </span>
              </span>
            </label>
          )
        )}

        {error && <div className="error">{error}</div>}
        {busy && (
          <div className="progress" aria-label="Progress">
            <div style={{ width: `${status ? 5 : progress}%` }} />
          </div>
        )}

        <button className="btn primary block" onClick={save} disabled={busy || parts.length < 2}>
          {saveLabel}
        </button>
      </div>
    </div>
  );
}
