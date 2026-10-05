import { del, list, rename } from "@vercel/blob";
import { isAuthed, unauthorized } from "@/lib/auth";
import { buildPathname, idFromPathname, isCategory, parsePathname, type Doc } from "@/lib/docs";

export const dynamic = "force-dynamic";

// All documents.
export async function GET(request: Request) {
  if (!(await isAuthed(request))) return unauthorized();

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
  return Response.json({ docs });
}

// Change a document's name, category or person.
export async function PATCH(request: Request) {
  if (!(await isAuthed(request))) return unauthorized();

  const { pathname, name, category, person } = (await request.json()) as Record<string, string>;
  const doc = parsePathname(pathname ?? "");
  if (!doc || !isCategory(category)) return Response.json({ error: "Invalid request" }, { status: 400 });

  const next = buildPathname({ name, category, person, ext: doc.ext, id: idFromPathname(pathname) });
  if (next !== pathname) await rename(pathname, next, { access: "private" });
  return Response.json({ pathname: next });
}

export async function DELETE(request: Request) {
  if (!(await isAuthed(request))) return unauthorized();

  const { pathname } = (await request.json()) as { pathname?: string };
  if (!pathname || !parsePathname(pathname)) return Response.json({ error: "Invalid request" }, { status: 400 });
  await del(pathname);
  return Response.json({ ok: true });
}
