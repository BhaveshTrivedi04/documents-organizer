// Browser-side helpers for saving and changing documents.

import { upload } from "@vercel/blob/client";
import { compressImage } from "@/lib/compress";
import { buildPathname, fileExtension, type CategoryKey, type Doc } from "@/lib/docs";
import { limitProblem, type Plan } from "@/lib/plan";

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

/**
 * Uploads one file straight from the phone to storage. `hash` is the original file's fingerprint.
 * `replaces` are saved documents the caller deletes once this upload succeeds; they
 * don't count against the plan's document limit.
 */
export async function uploadDocument(opts: {
  file: File;
  hash?: string;
  name: string;
  category: CategoryKey;
  person: string;
  replaces?: string[];
  onProgress?: (percentage: number) => void;
}) {
  const file = await compressImage(opts.file);
  const ext = fileExtension(file.name) || EXT_BY_MIME[file.type] || "";
  const pathname = buildPathname({ name: opts.name, category: opts.category, person: opts.person, ext, hash: opts.hash });
  try {
    await upload(pathname, file, {
      access: "private",
      handleUploadUrl: "/api/upload",
      clientPayload: JSON.stringify({ replaces: opts.replaces ?? [] }),
      contentType: file.type || MIME_BY_EXT[ext] || "application/octet-stream",
      multipart: file.size > 8 * 1024 * 1024,
      onUploadProgress: ({ percentage }) => opts.onProgress?.(percentage),
    });
  } catch (e) {
    // The upload library hides the server's reason, so work it out again here:
    // usually someone else filled the plan's limit after this screen opened.
    const res = await fetch("/api/docs", { cache: "no-store" }).catch(() => null);
    if (res?.status === 401) throw new Error("Please log in again.");
    if (res?.ok) {
      const { docs, plan } = (await res.json()) as { docs: Doc[]; plan: Plan };
      const problem = limitProblem(plan, docs, opts.person, opts.replaces);
      if (problem) throw new LimitError(problem);
    }
    throw e;
  }
}

/** A save was refused because the plan's document limit is reached. */
export class LimitError extends Error {}

/** Renames (PATCH) or deletes (DELETE) a saved document. */
export async function docsApi(method: "PATCH" | "DELETE", body: Record<string, string>) {
  const res = await fetch("/api/docs", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw data.limit ? new LimitError(data.error) : new Error(data.error ?? "Could not save");
  }
}
