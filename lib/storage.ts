import { list } from "@vercel/blob";
import { parsePathname, type Doc } from "@/lib/docs";

// Server only. Every saved document, newest first.
export async function listDocs(): Promise<Doc[]> {
  const docs: Doc[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: "docs/", cursor, limit: 1000 });
    for (const blob of page.blobs) {
      const doc = parsePathname(blob.pathname);
      if (doc) docs.push({ ...doc, size: blob.size, uploadedAt: blob.uploadedAt.toISOString() });
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  docs.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  return docs;
}
