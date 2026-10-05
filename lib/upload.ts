// Browser-side helpers for saving and changing documents.

import { upload } from "@vercel/blob/client";
import { compressImage } from "@/lib/compress";
import { buildPathname, fileExtension, type CategoryKey } from "@/lib/docs";

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

/** Uploads one file straight from the phone to storage. `hash` is the original file's fingerprint. */
export async function uploadDocument(opts: {
  file: File;
  hash?: string;
  name: string;
  category: CategoryKey;
  person: string;
  onProgress?: (percentage: number) => void;
}) {
  const file = await compressImage(opts.file);
  const ext = fileExtension(file.name) || EXT_BY_MIME[file.type] || "";
  const pathname = buildPathname({ name: opts.name, category: opts.category, person: opts.person, ext, hash: opts.hash });
  await upload(pathname, file, {
    access: "private",
    handleUploadUrl: "/api/upload",
    contentType: file.type || MIME_BY_EXT[ext] || "application/octet-stream",
    multipart: file.size > 8 * 1024 * 1024,
    onUploadProgress: ({ percentage }) => opts.onProgress?.(percentage),
  });
}

/** Renames (PATCH) or deletes (DELETE) a saved document. */
export async function docsApi(method: "PATCH" | "DELETE", body: Record<string, string>) {
  const res = await fetch("/api/docs", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not save");
}
