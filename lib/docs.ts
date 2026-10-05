// Shared between the browser and the server.
//
// Every document is one file in Vercel Blob. Its details live in the pathname so
// no separate database is needed:
//   docs/<CATEGORY>/<PERSON>/<NAME>__<ID>.<ext>
// Spaces are stored as "_". The ID is "<fingerprint>-<random>": the fingerprint
// (start of the file's SHA-256) lets us spot the same file saved twice, and the
// random part keeps each pathname unique.

export const CATEGORIES = [
  { key: "ID", label: "ID Proofs", icon: "🪪" },
  { key: "FINANCE", label: "Bank & Tax", icon: "🏦" },
  { key: "INSURANCE", label: "Insurance", icon: "🛡️" },
  { key: "MEDICAL", label: "Medical", icon: "🏥" },
  { key: "EDUCATION", label: "Education", icon: "🎓" },
  { key: "PROPERTY", label: "Property", icon: "🏠" },
  { key: "VEHICLE", label: "Vehicle", icon: "🚗" },
  { key: "BILLS", label: "Bills", icon: "🧾" },
  { key: "OTHER", label: "Other", icon: "📁" },
] as const;

export type CategoryKey = (typeof CATEGORIES)[number]["key"];

export const DEFAULT_PERSON = "Family";

export type Doc = {
  pathname: string;
  name: string;
  category: CategoryKey;
  person: string;
  ext: string;
  /** Fingerprint of the original file's contents, used to find duplicates. */
  hash?: string;
  size: number;
  uploadedAt: string;
};

export function categoryInfo(key: string) {
  return CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[CATEGORIES.length - 1];
}

export function isCategory(key: string): key is CategoryKey {
  return CATEGORIES.some((c) => c.key === key);
}

/** "vyom  AADHAR card" -> "Vyom Aadhar Card". Keeps only characters that are safe in a file path. */
export function cleanName(input: string): string {
  return titleCase(
    input
      .replace(/_/g, " ")
      .replace(/[^A-Za-z0-9 ().,&'-]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80),
  );
}

function toSegment(value: string) {
  return value.replace(/ /g, "_");
}

function fromSegment(value: string) {
  return value.replace(/_/g, " ");
}

export function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0) return "";
  return fileName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
}

const HASH_LENGTH = 24;

function randomPart(length: number): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, length);
}

export function newId(hash?: string): string {
  return hash ? `${hash.slice(0, HASH_LENGTH)}-${randomPart(6)}` : randomPart(16);
}

/** SHA-256 of a file's contents, as hex. */
export async function hashFile(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function hashFromId(id: string | undefined): string | undefined {
  const head = id?.split("-")[0];
  return head && head.length === HASH_LENGTH ? head : undefined;
}

export function sameHash(a: string | undefined, b: string | undefined): boolean {
  return Boolean(a && b && a.slice(0, HASH_LENGTH) === b.slice(0, HASH_LENGTH));
}

export function buildPathname(opts: {
  name: string;
  category: CategoryKey;
  person: string;
  ext: string;
  id?: string;
  hash?: string;
}): string {
  const name = cleanName(opts.name) || "Document";
  const person = cleanName(opts.person) || DEFAULT_PERSON;
  const file = `${toSegment(name)}__${opts.id ?? newId(opts.hash)}${opts.ext ? "." + opts.ext : ""}`;
  return `docs/${opts.category}/${toSegment(person)}/${file}`;
}

export function parsePathname(pathname: string): Omit<Doc, "size" | "uploadedAt"> | null {
  const parts = pathname.split("/");
  if (parts.length !== 4 || parts[0] !== "docs") return null;
  const [, category, person, file] = parts;
  const dot = file.lastIndexOf(".");
  const base = dot > 0 ? file.slice(0, dot) : file;
  const ext = dot > 0 ? file.slice(dot + 1) : "";
  const sep = base.lastIndexOf("__");
  const name = sep > 0 ? base.slice(0, sep) : base;
  return {
    pathname,
    // titleCase also tidies documents saved before names were stored this way.
    name: titleCase(fromSegment(name)),
    category: isCategory(category) ? category : "OTHER",
    person: titleCase(fromSegment(person)),
    ext,
    hash: hashFromId(sep > 0 ? base.slice(sep + 2) : undefined),
  };
}

export function idFromPathname(pathname: string): string | undefined {
  const file = pathname.split("/").pop() ?? "";
  const base = file.includes(".") ? file.slice(0, file.lastIndexOf(".")) : file;
  const sep = base.lastIndexOf("__");
  return sep > 0 ? base.slice(sep + 2) : undefined;
}

/**
 * Loose form used for searching, so different spellings still match:
 * "Aadhaar", "AADHAR", "adhar" all become "ADHAR".
 */
export function searchKey(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/(.)\1+/g, "$1");
}

export function matchesSearch(doc: Doc, query: string): boolean {
  const words = query.split(/\s+/).map(searchKey).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = searchKey(
    `${doc.name} ${doc.person} ${categoryInfo(doc.category).label} ${doc.ext}`,
  );
  return words.every((w) => haystack.includes(w));
}

// Keywords used to pick a category automatically from the document name.
const CATEGORY_KEYWORDS: Record<Exclude<CategoryKey, "OTHER">, string[]> = {
  ID: ["AADHAR", "AADHAAR", "ADHAR", "PAN", "PASSPORT", "VOTER", "ELECTION", "LICENSE", "LICENCE", "DL", "BIRTH", "IDENTITY", "RATION"],
  FINANCE: ["BANK", "PASSBOOK", "CHEQUE", "CHECK", "FD", "ITR", "TAX", "FORM 16", "SALARY", "STATEMENT", "PF", "PPF", "MUTUAL", "DEMAT", "LOAN"],
  INSURANCE: ["INSURANCE", "POLICY", "LIC", "MEDICLAIM", "PREMIUM"],
  MEDICAL: ["REPORT", "PRESCRIPTION", "HOSPITAL", "BLOOD", "MEDICAL", "DOCTOR", "XRAY", "X-RAY", "SCAN", "VACCINE", "VACCINATION", "DISCHARGE"],
  EDUCATION: ["MARKSHEET", "MARK SHEET", "DEGREE", "CERTIFICATE", "SCHOOL", "COLLEGE", "10TH", "12TH", "SSC", "HSC", "RESULT", "TRANSCRIPT"],
  PROPERTY: ["PROPERTY", "DEED", "RENT", "AGREEMENT", "HOUSE", "FLAT", "LAND", "REGISTRY", "INDEX", "MUNICIPAL"],
  VEHICLE: ["RC", "VEHICLE", "CAR", "BIKE", "SCOOTER", "PUC"],
  BILLS: ["BILL", "ELECTRICITY", "LIGHT", "GAS", "WATER", "PHONE", "INTERNET", "RECEIPT", "INVOICE", "WARRANTY"],
};

export function guessCategory(name: string): CategoryKey | null {
  const words = new Set(cleanName(name).split(" ").map(searchKey));
  const whole = searchKey(name);
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      const key = searchKey(kw);
      // Short keywords (PAN, RC, DL) must be a whole word; longer ones can appear anywhere.
      if (key.length <= 3 ? words.has(key) : whole.includes(key)) return category as CategoryKey;
    }
  }
  return null;
}

// Short forms that should stay in capitals in file names ("PAN Card", not "Pan Card").
const ACRONYMS = new Set([
  "PAN", "RC", "DL", "PUC", "LIC", "ITR", "PF", "PPF", "EPF", "UAN", "FD", "RD", "KYC", "GST", "TDS",
  "SSC", "HSC", "CBSE", "ICSE", "NOC", "ID", "UPI", "ATM", "IFSC", "HUF", "NRI", "OCI", "PIN", "SBI",
  "HDFC", "ICICI", "PNB", "BOB", "LPG", "EB", "MRI", "CT", "ECG", "OPD", "ICU", "BCOM", "BSC", "MBA",
  "USA", "UK", "UAE", "II", "III", "IV",
]);

/**
 * How names are stored and shown: "VYOM AADHAR CARD" -> "Vyom Aadhar Card",
 * "pan card - page 2" -> "PAN Card - Page 2", "10TH MARKSHEET" -> "10th Marksheet".
 */
export function titleCase(name: string): string {
  return name
    .split(" ")
    .map((word) =>
      ACRONYMS.has(word.toUpperCase().replace(/[^A-Z]/g, ""))
        ? word.toUpperCase()
        : word.toLowerCase().replace(/(^|[-(/.&])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase()),
    )
    .join(" ");
}

/** File name used when downloading or sharing, e.g. "Vyom Aadhar Card.pdf". */
export function downloadFileName(doc: Pick<Doc, "name" | "ext">): string {
  return `${titleCase(doc.name)}${doc.ext ? "." + doc.ext : ""}`;
}

export function fileKind(ext: string): "image" | "pdf" | "other" {
  if (["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  return "other";
}

export function fileIcon(ext: string): string {
  if (fileKind(ext) === "image") return "🖼️";
  if (["doc", "docx", "odt", "rtf", "txt"].includes(ext)) return "📝";
  if (["xls", "xlsx", "ods", "csv"].includes(ext)) return "📊";
  if (["ppt", "pptx", "odp"].includes(ext)) return "📽️";
  if (["zip", "rar", "7z"].includes(ext)) return "🗜️";
  if (["mp4", "mov", "mp3", "m4a", "wav"].includes(ext)) return "🎞️";
  return "📄";
}

/** "Aadhar Card - Page 2" and "aadhar card" are the same document name. */
export function sameDocName(a: string, b: string): boolean {
  const base = (n: string) => searchKey(cleanName(n).replace(/ - Page \d+$/i, ""));
  return base(a) !== "" && base(a) === base(b);
}

/** Documents whose file contents match another saved document, grouped by fingerprint. */
export function duplicateGroups(docs: Doc[]): Doc[][] {
  const byHash = new Map<string, Doc[]>();
  for (const d of docs) if (d.hash) byHash.set(d.hash, [...(byHash.get(d.hash) ?? []), d]);
  return [...byHash.values()].filter((g) => g.length > 1);
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
