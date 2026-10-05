"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import UploadSheet from "@/components/UploadSheet";
import ViewerSheet, { fileUrl, formatDate } from "@/components/ViewerSheet";
import {
  CATEGORIES,
  categoryInfo,
  duplicateGroups,
  fileIcon,
  fileKind,
  formatSize,
  matchesSearch,
  type Doc,
} from "@/lib/docs";

// Blob storage included in Vercel's free Hobby plan.
const STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024;

type Sheet = { type: "view"; doc: Doc } | { type: "edit"; doc: Doc } | { type: "upload" } | null;

export default function Home() {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("ALL");
  const [person, setPerson] = useState("ALL");
  const [sort, setSort] = useState<"new" | "az">("new");
  const [onlyDupes, setOnlyDupes] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  function done(message: string) {
    closeSheet();
    load();
    setToast({ message, id: Date.now() });
  }

  const load = useCallback(async () => {
    setLoadError("");
    const res = await fetch("/api/docs", { cache: "no-store" });
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!res.ok) {
      setLoadError("Could not load documents.");
      return;
    }
    setDocs((await res.json()).docs);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Let the phone's Back button close popups instead of leaving the site.
  useEffect(() => {
    const onPop = () => setSheet(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function openSheet(next: Sheet) {
    if (!sheet) history.pushState({ sheet: true }, "");
    setSheet(next);
  }

  function closeSheet() {
    if (history.state?.sheet) history.back();
    else setSheet(null);
  }

  const all = docs ?? [];
  const persons = useMemo(() => Array.from(new Set(all.map((d) => d.person))).sort(), [all]);

  // Documents saved more than once (same file contents, any name).
  const dupeGroups = useMemo(() => duplicateGroups(all), [all]);
  const dupesOf = useMemo(() => {
    const map = new Map<string, Doc[]>();
    for (const group of dupeGroups) for (const d of group) map.set(d.pathname, group.filter((o) => o !== d));
    return map;
  }, [dupeGroups]);

  const searched = useMemo(
    () => all.filter((d) => matchesSearch(d, query) && (!onlyDupes || dupesOf.has(d.pathname))),
    [all, query, onlyDupes, dupesOf],
  );

  const visible = useMemo(() => {
    const list = searched.filter(
      (d) => (category === "ALL" || d.category === category) && (person === "ALL" || d.person === person),
    );
    if (onlyDupes) list.sort((a, b) => (a.hash ?? "").localeCompare(b.hash ?? ""));
    else if (sort === "az") list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [searched, category, person, sort, onlyDupes]);

  // Chip counts reflect the current search and the other filter.
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of searched) if (person === "ALL" || d.person === person) counts[d.category] = (counts[d.category] ?? 0) + 1;
    return counts;
  }, [searched, person]);

  const grouped = category === "ALL" && !query && !onlyDupes;
  const filtersOn = category !== "ALL" || person !== "ALL" || query !== "" || onlyDupes;
  const extraCopies = dupeGroups.reduce((n, g) => n + g.length - 1, 0);
  const usedBytes = all.reduce((n, d) => n + d.size, 0);
  const usedPercent = Math.min(100, (usedBytes / STORAGE_LIMIT_BYTES) * 100);

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <main className="app">
      <header className="header">
        <div className="title-row">
          <div>
            <h1 className="title">Family Documents</h1>
            <div className="subtitle">
              {docs ? `${docs.length} document${docs.length === 1 ? "" : "s"} saved` : "Loading…"}
            </div>
          </div>
          <button className="link-btn" onClick={logout}>
            Log out
          </button>
        </div>

        <div className="search">
          <span className="icon">🔍</span>
          <input
            type="search"
            placeholder="Search: Aadhar, PAN, Mom…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            enterKeyHint="search"
          />
          {query && (
            <button className="clear" onClick={() => setQuery("")} aria-label="Clear search">
              ✕
            </button>
          )}
        </div>

        <div className="chips" role="tablist" aria-label="Type">
          <button className={`chip ${category === "ALL" ? "active" : ""}`} onClick={() => setCategory("ALL")}>
            All
          </button>
          {CATEGORIES.filter((c) => categoryCounts[c.key] || category === c.key).map((c) => (
            <button
              key={c.key}
              className={`chip ${category === c.key ? "active" : ""}`}
              onClick={() => setCategory(category === c.key ? "ALL" : c.key)}
            >
              {c.icon} {c.label} <span className="count">{categoryCounts[c.key] ?? 0}</span>
            </button>
          ))}
        </div>

        {persons.length > 1 && (
          <div className="chips" aria-label="Whose">
            <button className={`chip small ${person === "ALL" ? "active" : ""}`} onClick={() => setPerson("ALL")}>
              👪 Everyone
            </button>
            {persons.map((p) => (
              <button
                key={p}
                className={`chip small ${person === p ? "active" : ""}`}
                onClick={() => setPerson(person === p ? "ALL" : p)}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </header>

      {docs && (
        <div className={`storage ${usedPercent >= 80 ? "high" : ""}`}>
          <div className="storage-text">
            <span>💾 Storage used</span>
            <span>
              <strong>{formatSize(usedBytes)}</strong> of 1 GB ({usedPercent < 1 && usedBytes > 0 ? "<1" : Math.round(usedPercent)}%)
            </span>
          </div>
          <div className="storage-bar" aria-hidden="true">
            <div style={{ width: `${Math.max(usedPercent, usedBytes > 0 ? 1 : 0)}%` }} />
          </div>
          {usedPercent >= 80 && (
            <div className="storage-warn">Storage is almost full. Delete old copies or upgrade the Vercel plan.</div>
          )}
        </div>
      )}

      {loadError && (
        <div className="error" style={{ marginTop: 12 }}>
          {loadError}{" "}
          <button className="link-btn" onClick={load}>
            Retry
          </button>
        </div>
      )}

      {!docs && !loadError && <div className="spinner" aria-label="Loading" />}

      {extraCopies > 0 && !onlyDupes && (
        <button className="banner" onClick={() => setOnlyDupes(true)}>
          <span>
            ⚠️ {extraCopies} document{extraCopies === 1 ? " is" : "s are"} saved more than once
          </span>
          <span className="banner-action">Review →</span>
        </button>
      )}
      {onlyDupes && (
        <div className="banner static">
          Showing files saved more than once. Open one to see its copies, then delete the extras.
        </div>
      )}

      {docs && (
        <>
          <div className="toolbar">
            <span>
              {filtersOn ? `${visible.length} found` : ""}
              {filtersOn && (
                <button
                  className="link-btn"
                  onClick={() => {
                    setQuery("");
                    setCategory("ALL");
                    setPerson("ALL");
                    setOnlyDupes(false);
                  }}
                >
                  Clear filters
                </button>
              )}
            </span>
            <button className="link-btn" onClick={() => setSort(sort === "new" ? "az" : "new")}>
              Sort: {sort === "new" ? "Newest first" : "A → Z"}
            </button>
          </div>

          {docs.length === 0 ? (
            <div className="empty">
              <div className="big">🗂️</div>
              <div>No documents yet.</div>
              <div>Tap “＋ Add” to save your first one.</div>
            </div>
          ) : visible.length === 0 ? (
            <div className="empty">
              <div className="big">🔍</div>
              <div>Nothing found{query ? ` for “${query}”` : ""}.</div>
            </div>
          ) : grouped ? (
            CATEGORIES.map((c) => {
              const items = visible.filter((d) => d.category === c.key);
              if (items.length === 0) return null;
              return (
                <section key={c.key}>
                  <h2 className="section-title">
                    {c.icon} {c.label} <span className="count">{items.length}</span>
                  </h2>
                  <DocGrid docs={items} onOpen={(doc) => openSheet({ type: "view", doc })} dupes={dupesOf} />
                </section>
              );
            })
          ) : (
            <DocGrid
              docs={visible}
              onOpen={(doc) => openSheet({ type: "view", doc })}
              showCategory
              dupes={dupesOf}
            />
          )}
        </>
      )}

      {toast && (
        <div className="toast" key={toast.id} role="status" aria-live="polite" onClick={() => setToast(null)}>
          <span className="toast-icon">✅</span>
          <span>{toast.message}</span>
        </div>
      )}

      <button className="fab" onClick={() => openSheet({ type: "upload" })}>
        ＋ Add
      </button>

      {sheet?.type === "view" && (
        <ViewerSheet
          key={sheet.doc.pathname}
          doc={sheet.doc}
          duplicates={dupesOf.get(sheet.doc.pathname) ?? []}
          onOpenDoc={(doc) => setSheet({ type: "view", doc })}
          onClose={closeSheet}
          onEdit={() => setSheet({ type: "edit", doc: sheet.doc })}
          onChanged={done}
        />
      )}

      {(sheet?.type === "upload" || sheet?.type === "edit") && (
        <UploadSheet
          docs={all}
          editDoc={sheet.type === "edit" ? sheet.doc : undefined}
          onClose={closeSheet}
          onSaved={done}
        />
      )}
    </main>
  );
}

function DocGrid({
  docs,
  onOpen,
  showCategory,
  dupes,
}: {
  docs: Doc[];
  onOpen: (d: Doc) => void;
  showCategory?: boolean;
  dupes: Map<string, Doc[]>;
}) {
  return (
    <div className="grid">
      {docs.map((d) => {
        const cat = categoryInfo(d.category);
        return (
          <button key={d.pathname} className="card" onClick={() => onOpen(d)}>
            <div className="thumb">
              {fileKind(d.ext) === "image" ? <img src={fileUrl(d)} alt="" loading="lazy" /> : fileIcon(d.ext)}
            </div>
            <div className="card-body">
              <div className="doc-name">{d.name}</div>
              <div className="doc-meta">
                <span className="pill">{d.person}</span>
                {dupes.has(d.pathname) && <span className="pill warn">Saved twice</span>}
                {showCategory && (
                  <span>
                    {cat.icon} {cat.label}
                  </span>
                )}
                <span>{formatDate(d.uploadedAt)}</span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
