"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon, { FileGlyph } from "@/components/Icon";
import LazyImage from "@/components/LazyImage";
import MergeSheet from "@/components/MergeSheet";
import UploadSheet from "@/components/UploadSheet";
import ViewerSheet, { fileUrl } from "@/components/ViewerSheet";
import {
  CATEGORIES,
  categoryInfo,
  duplicateGroups,
  fileKind,
  formatSize,
  initials,
  matchesSearch,
  relativeDate,
  type Doc,
} from "@/lib/docs";
import { canMergeDoc } from "@/lib/pdf";

// Blob storage included in Vercel's free Hobby plan.
const STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024;
const LAYOUT_KEY = "family-docs-layout";

type Sheet =
  | { type: "view"; doc: Doc }
  | { type: "edit"; doc: Doc }
  | { type: "upload" }
  | { type: "merge"; docs: Doc[]; base?: Doc }
  | null;

type Layout = "grid" | "list";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function Home() {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("ALL");
  const [person, setPerson] = useState("ALL");
  const [sort, setSort] = useState<"new" | "az">("new");
  const [onlyDupes, setOnlyDupes] = useState(false);
  const [browseAll, setBrowseAll] = useState(false);
  const [layout, setLayout] = useState<Layout>("grid");
  const [hello, setHello] = useState("Welcome");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null);
  /** Select mode: pathnames in the order they were tapped (that becomes the page order). */
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;

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
    setHello(greeting());
    try {
      const saved = localStorage.getItem(LAYOUT_KEY);
      if (saved === "list" || saved === "grid") setLayout(saved);
    } catch {}
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  // ----- Navigation: Home ↔ results, plus popups, all work with the phone's Back button -----

  const inResults = Boolean(query) || category !== "ALL" || person !== "ALL" || onlyDupes || browseAll;

  function resetToHome() {
    setQuery("");
    setCategory("ALL");
    setPerson("ALL");
    setOnlyDupes(false);
    setBrowseAll(false);
    setSelecting(false);
    setSelected([]);
    window.scrollTo({ top: 0 });
  }

  useEffect(() => {
    const onPop = () => {
      if (sheetRef.current) setSheet(null);
      else resetToHome();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Leaving Home adds a history step, so Back returns to Home instead of leaving the site.
  const pushedResults = useRef(false);
  useEffect(() => {
    if (inResults && !pushedResults.current) {
      history.pushState({ view: "results" }, "");
      pushedResults.current = true;
      window.scrollTo({ top: 0 });
    }
    if (!inResults) pushedResults.current = false;
  }, [inResults]);

  function goHome() {
    if (history.state?.view === "results") history.back();
    else resetToHome();
  }

  function openSheet(next: Sheet) {
    if (!sheet) history.pushState({ sheet: true, view: history.state?.view }, "");
    setSheet(next);
  }

  function closeSheet() {
    if (history.state?.sheet) history.back();
    else setSheet(null);
  }

  function done(message: string) {
    closeSheet();
    load();
    stopSelecting();
    setToast({ message, id: Date.now() });
  }

  function stopSelecting() {
    setSelecting(false);
    setSelected([]);
  }

  function toggleSelected(doc: Doc) {
    setSelected((prev) =>
      prev.includes(doc.pathname) ? prev.filter((p) => p !== doc.pathname) : [...prev, doc.pathname],
    );
  }

  function changeLayout(next: Layout) {
    setLayout(next);
    try {
      localStorage.setItem(LAYOUT_KEY, next);
    } catch {}
  }

  // ----- Data -----

  const all = docs ?? [];

  const people = useMemo(() => {
    const map = new Map<string, Doc[]>();
    for (const d of all) map.set(d.person, [...(map.get(d.person) ?? []), d]);
    return [...map.entries()]
      .map(([name, list]) => ({ name, docs: list }))
      .sort((a, b) => b.docs.length - a.docs.length || a.name.localeCompare(b.name));
  }, [all]);

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

  const personCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of searched) if (category === "ALL" || d.category === category) counts[d.person] = (counts[d.person] ?? 0) + 1;
    return counts;
  }, [searched, category]);

  const allCategoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of all) counts[d.category] = (counts[d.category] ?? 0) + 1;
    return counts;
  }, [all]);

  const recent = useMemo(
    () => [...all].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)).slice(0, 5),
    [all],
  );

  const extraCopies = dupeGroups.reduce((n, g) => n + g.length - 1, 0);
  const usedBytes = all.reduce((n, d) => n + d.size, 0);
  const usedPercent = Math.min(100, (usedBytes / STORAGE_LIMIT_BYTES) * 100);

  const selectedDocs = selected.map((p) => all.find((d) => d.pathname === p)).filter((d): d is Doc => Boolean(d));
  const unmergeable = selectedDocs.filter((d) => !canMergeDoc(d));
  const openDoc = (doc: Doc) => (selecting ? toggleSelected(doc) : openSheet({ type: "view", doc }));

  // ----- Results page title -----

  const cat = category !== "ALL" ? categoryInfo(category) : null;
  let title = "All documents";
  if (onlyDupes) title = "Saved twice";
  else if (query) title = `“${query.trim()}”`;
  else if (person !== "ALL" && cat) title = `${person} · ${cat.label}`;
  else if (person !== "ALL") title = person;
  else if (cat) title = cat.label;

  const groupByType = category === "ALL" && !onlyDupes;
  // Hide the chip row for whatever was tapped on Home (it's already the page title).
  const showTypeChips = !(cat && !query && person === "ALL");
  const showPersonChips = people.length > 1 && !(person !== "ALL" && !query && !cat);

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const cardProps = {
    onOpen: openDoc,
    dupes: dupesOf,
    selected: selecting ? selected : null,
    showPerson: person === "ALL",
  };

  return (
    <main className="app">
      <header className="header">
        {inResults ? (
          <div className="results-head">
            <button className="round-btn" onClick={goHome} aria-label="Back to home">
              <Icon name="back" />
            </button>
            <div className="results-title">
              <h1 className="serif">{title}</h1>
              <div className="subtitle">
                {visible.length} document{visible.length === 1 ? "" : "s"}
              </div>
            </div>
            {person !== "ALL" && !query && <span className="avatar small">{initials(person)}</span>}
          </div>
        ) : (
          <div className="title-row">
            <div>
              <div className="greeting">{hello}</div>
              <h1 className="title serif">Your Documents</h1>
            </div>
            <button className="round-btn" onClick={logout} aria-label="Log out" title="Log out">
              <Icon name="logout" size={19} />
            </button>
          </div>
        )}

        <div className="search">
          <Icon name="search" size={19} className="search-icon" />
          <input
            type="search"
            placeholder="Search documents"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            enterKeyHint="search"
          />
          {query && (
            <button
              className="clear"
              onClick={() =>
                category === "ALL" && person === "ALL" && !onlyDupes && !browseAll ? goHome() : setQuery("")
              }
              aria-label="Clear search"
            >
              <Icon name="x" size={16} />
            </button>
          )}
        </div>

        {inResults && docs && (
          <>
            {showTypeChips && (
              <div className="chips" aria-label="Type">
                <button className={`chip ${category === "ALL" ? "active" : ""}`} onClick={() => setCategory("ALL")}>
                  All
                </button>
                {CATEGORIES.filter((c) => categoryCounts[c.key] || category === c.key).map((c) => (
                  <button
                    key={c.key}
                    className={`chip ${category === c.key ? "active" : ""}`}
                    onClick={() => setCategory(category === c.key ? "ALL" : c.key)}
                  >
                    <Icon name={c.icon} size={15} />
                    {c.label} <span className="count">{categoryCounts[c.key] ?? 0}</span>
                  </button>
                ))}
              </div>
            )}
            {showPersonChips && (
              <div className="chips" aria-label="Whose">
                <button className={`chip ${person === "ALL" ? "active" : ""}`} onClick={() => setPerson("ALL")}>
                  <Icon name="users" size={15} />
                  Everyone
                </button>
                {people
                  .filter((p) => personCounts[p.name] || person === p.name)
                  .map((p) => (
                    <button
                      key={p.name}
                      className={`chip ${person === p.name ? "active" : ""}`}
                      onClick={() => setPerson(person === p.name ? "ALL" : p.name)}
                    >
                      {p.name} <span className="count">{personCounts[p.name] ?? 0}</span>
                    </button>
                  ))}
              </div>
            )}
          </>
        )}
      </header>

      {loadError && (
        <div className="error" style={{ marginTop: 12 }}>
          {loadError}{" "}
          <button className="link-btn" onClick={load}>
            Retry
          </button>
        </div>
      )}

      {!docs && !loadError && <div className="spinner" aria-label="Loading" />}

      {docs && docs.length === 0 && (
        <div className="empty">
          <FileGlyph ext="" size={44} />
          <p className="serif empty-title">Nothing here yet</p>
          <p>Tap the + button below to save your first document.</p>
        </div>
      )}

      {/* ---------------- Home ---------------- */}
      {docs && docs.length > 0 && !inResults && (
        <>
          {extraCopies > 0 && (
            <button className="banner" onClick={() => setOnlyDupes(true)}>
              <Icon name="copy" size={18} />
              <span className="banner-text">
                {extraCopies} document{extraCopies === 1 ? " is" : "s are"} saved twice
              </span>
              <span className="banner-action">
                Review <Icon name="right" size={16} />
              </span>
            </button>
          )}

          <section className="home-section">
            <h2 className="section-heading">People</h2>
            <div className="people-grid">
              {people.map((p) => (
                <button key={p.name} className="person-tile glass" onClick={() => setPerson(p.name)}>
                  <span className="avatar">{initials(p.name)}</span>
                  <span className="person-info">
                    <span className="person-name">{p.name}</span>
                    <span className="person-count">
                      {p.docs.length} document{p.docs.length === 1 ? "" : "s"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="home-section">
            <h2 className="section-heading">Categories</h2>
            <div className="type-grid">
              {CATEGORIES.filter((c) => allCategoryCounts[c.key]).map((c) => (
                <button key={c.key} className="type-tile glass" onClick={() => setCategory(c.key)}>
                  <span className="type-icon">
                    <Icon name={c.icon} size={22} />
                  </span>
                  <span className="type-label">{c.label}</span>
                  <span className="type-count">{allCategoryCounts[c.key]}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="home-section">
            <div className="section-heading-row">
              <h2 className="section-heading">Recent</h2>
              <button className="link-btn" onClick={() => setBrowseAll(true)}>
                See all
              </button>
            </div>
            <div className="recent-list">
              {recent.map((d) => (
                <RecentRow key={d.pathname} doc={d} onOpen={openDoc} />
              ))}
            </div>
          </section>

          <div className={`storage glass ${usedPercent >= 80 ? "high" : ""}`}>
            <div className="storage-text">
              <span className="storage-label">
                <Icon name="storage" size={16} /> Storage
              </span>
              <span>
                <strong>{formatSize(usedBytes)}</strong> of 1 GB
              </span>
            </div>
            <div className="storage-bar" aria-hidden="true">
              <div style={{ width: `${Math.max(usedPercent, usedBytes > 0 ? 1 : 0)}%` }} />
            </div>
            {usedPercent >= 80 && (
              <div className="storage-warn">Storage is almost full. Delete old copies or upgrade the Vercel plan.</div>
            )}
          </div>
        </>
      )}

      {/* ---------------- Results ---------------- */}
      {docs && docs.length > 0 && inResults && (
        <>
          <div className="toolbar">
            <span className="toolbar-actions">
              <button className="tool-btn" onClick={() => setSort(sort === "new" ? "az" : "new")}>
                <Icon name="sort" size={16} />
                {sort === "new" ? "Newest" : "A–Z"}
              </button>
              {visible.length > 1 && !selecting && (
                <button className="tool-btn" onClick={() => setSelecting(true)}>
                  <Icon name="select" size={16} />
                  Select
                </button>
              )}
            </span>
            <span className="segmented" role="group" aria-label="Layout">
              <button className={layout === "grid" ? "on" : ""} onClick={() => changeLayout("grid")} aria-label="Pictures">
                <Icon name="grid" size={16} />
              </button>
              <button className={layout === "list" ? "on" : ""} onClick={() => changeLayout("list")} aria-label="List">
                <Icon name="list" size={16} />
              </button>
            </span>
          </div>

          {onlyDupes && (
            <div className="note">Open one to see its copies, then keep one and delete the extras.</div>
          )}
          {selecting && <div className="note">Tap documents in page order (front first, then back), then Merge.</div>}

          {visible.length === 0 ? (
            <div className="empty">
              <Icon name="search" size={36} stroke={1.5} />
              <p className="serif empty-title">Nothing found</p>
              <button className="btn" onClick={goHome}>
                <Icon name="back" size={18} /> Back to home
              </button>
            </div>
          ) : groupByType ? (
            CATEGORIES.map((c) => {
              const items = visible.filter((d) => d.category === c.key);
              if (items.length === 0) return null;
              return (
                <section key={c.key}>
                  <h2 className="section-title">
                    <Icon name={c.icon} size={17} />
                    {c.label} <span className="count">{items.length}</span>
                  </h2>
                  <DocCollection docs={items} layout={layout} cardProps={cardProps} />
                </section>
              );
            })
          ) : (
            <div style={{ marginTop: 14 }}>
              <DocCollection docs={visible} layout={layout} cardProps={{ ...cardProps, showCategory: true }} />
            </div>
          )}
        </>
      )}

      {toast && (
        <div className="toast" key={toast.id} role="status" aria-live="polite" onClick={() => setToast(null)}>
          <span className="toast-icon">
            <Icon name="check" size={16} stroke={2.5} />
          </span>
          <span>{toast.message}</span>
        </div>
      )}

      {selecting ? (
        <div className="select-bar glass">
          <div className="select-info">
            <strong>{selected.length} selected</strong>
            <span>
              {unmergeable.length > 0
                ? "Only photos and PDFs can be merged"
                : selected.length < 2
                  ? "Pick at least 2"
                  : "Ready to merge"}
            </span>
          </div>
          <button className="btn small" onClick={stopSelecting}>
            Cancel
          </button>
          <button
            className="btn small primary"
            disabled={selected.length < 2 || unmergeable.length > 0}
            onClick={() => openSheet({ type: "merge", docs: selectedDocs })}
          >
            <Icon name="merge" size={16} /> Merge
          </button>
        </div>
      ) : (
        <nav className="dock glass" aria-label="Main">
          <button className={`dock-btn ${!inResults ? "on" : ""}`} onClick={goHome} aria-label="Home">
            <Icon name="home" size={22} />
          </button>
          <button className="dock-add" onClick={() => openSheet({ type: "upload" })} aria-label="Add a document">
            <Icon name="plus" size={24} stroke={2.2} />
          </button>
          <button
            className={`dock-btn ${browseAll && !query && category === "ALL" && person === "ALL" ? "on" : ""}`}
            onClick={() => {
              setQuery("");
              setCategory("ALL");
              setPerson("ALL");
              setOnlyDupes(false);
              setBrowseAll(true);
            }}
            aria-label="All documents"
          >
            <Icon name="grid" size={22} />
          </button>
        </nav>
      )}

      {sheet?.type === "view" && (
        <ViewerSheet
          key={sheet.doc.pathname}
          doc={sheet.doc}
          duplicates={dupesOf.get(sheet.doc.pathname) ?? []}
          onOpenDoc={(doc) => setSheet({ type: "view", doc })}
          onClose={closeSheet}
          onEdit={() => setSheet({ type: "edit", doc: sheet.doc })}
          onAddPages={() => setSheet({ type: "merge", docs: [sheet.doc], base: sheet.doc })}
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

      {sheet?.type === "merge" && (
        <MergeSheet docs={all} initial={sheet.docs} base={sheet.base} onClose={closeSheet} onSaved={done} />
      )}
    </main>
  );
}

type CardProps = {
  onOpen: (d: Doc) => void;
  dupes: Map<string, Doc[]>;
  /** In select mode, the selected pathnames in order; null otherwise. */
  selected: string[] | null;
  showPerson: boolean;
  showCategory?: boolean;
};

/** Small square preview: the photo itself, or a file glyph. */
function Thumb({ doc, glyphSize = 30 }: { doc: Doc; glyphSize?: number }) {
  return fileKind(doc.ext) === "image" ? (
    <LazyImage src={fileUrl(doc)} fallback={<FileGlyph ext={doc.ext} size={glyphSize} />} />
  ) : (
    <FileGlyph ext={doc.ext} size={glyphSize} />
  );
}

/** Home "Recent" row, like a file list: preview, name, when, and a View button. */
function RecentRow({ doc, onOpen }: { doc: Doc; onOpen: (d: Doc) => void }) {
  return (
    <button className="recent-row glass" onClick={() => onOpen(doc)}>
      <span className="recent-thumb">
        <Thumb doc={doc} glyphSize={26} />
      </span>
      <span className="recent-body">
        <span className="recent-name">{doc.name}</span>
        <span className="recent-meta">
          {doc.person} · {relativeDate(doc.uploadedAt)}
        </span>
      </span>
      <span className="pill-btn">
        <Icon name="eye" size={15} /> View
      </span>
    </button>
  );
}

function DocCollection({ docs, layout, cardProps }: { docs: Doc[]; layout: Layout; cardProps: CardProps }) {
  return (
    <div className={layout === "grid" ? "tile-grid" : "row-list"}>
      {docs.map((d) =>
        layout === "grid" ? (
          <DocTile key={d.pathname} doc={d} {...cardProps} />
        ) : (
          <DocRow key={d.pathname} doc={d} {...cardProps} />
        ),
      )}
    </div>
  );
}

function SelectCheck({ doc, selected }: { doc: Doc; selected: string[] | null }) {
  if (!selected) return null;
  const index = selected.indexOf(doc.pathname);
  return <span className={`check ${index >= 0 ? "on" : ""}`}>{index >= 0 ? index + 1 : ""}</span>;
}

function cardClass(base: string, doc: Doc, selected: string[] | null) {
  return `${base} glass ${selected?.includes(doc.pathname) ? "selected" : ""} ${selected && !canMergeDoc(doc) ? "dim" : ""}`;
}

/** Picture tile: big preview on top, name underneath. Easy to skim. */
function DocTile({ doc, onOpen, dupes, selected, showPerson, showCategory }: CardProps & { doc: Doc }) {
  const cat = categoryInfo(doc.category);
  return (
    <button
      className={cardClass("tile", doc, selected)}
      onClick={() => onOpen(doc)}
      aria-pressed={selected ? selected.includes(doc.pathname) : undefined}
    >
      <span className="tile-thumb">
        <Thumb doc={doc} glyphSize={38} />
        <SelectCheck doc={doc} selected={selected} />
      </span>
      <span className="tile-body">
        <span className="tile-name">{doc.name}</span>
        <span className="tile-meta">
          {showPerson && <span>{doc.person}</span>}
          {showCategory && <span>{cat.label}</span>}
          <span>{relativeDate(doc.uploadedAt)}</span>
        </span>
        {dupes.has(doc.pathname) && <span className="tag warn">Saved twice</span>}
      </span>
    </button>
  );
}

/** Compact row for the list layout. */
function DocRow({ doc, onOpen, dupes, selected, showPerson, showCategory }: CardProps & { doc: Doc }) {
  const cat = categoryInfo(doc.category);
  return (
    <button
      className={cardClass("row", doc, selected)}
      onClick={() => onOpen(doc)}
      aria-pressed={selected ? selected.includes(doc.pathname) : undefined}
    >
      <span className="recent-thumb">
        <Thumb doc={doc} glyphSize={26} />
        <SelectCheck doc={doc} selected={selected} />
      </span>
      <span className="recent-body">
        <span className="recent-name">{doc.name}</span>
        <span className="recent-meta">
          {[showPerson && doc.person, showCategory && cat.label, relativeDate(doc.uploadedAt)].filter(Boolean).join(" · ")}
        </span>
        {dupes.has(doc.pathname) && <span className="tag warn">Saved twice</span>}
      </span>
      <Icon name="right" size={18} className="row-chevron" />
    </button>
  );
}
