import { get } from "@vercel/blob";
import { isAuthed, unauthorized } from "@/lib/auth";
import { parsePathname } from "@/lib/docs";

// Streams a private document to a logged-in family member.
// ?download=1 makes the browser save it instead of showing it.
export async function GET(request: Request) {
  if (!(await isAuthed(request))) return unauthorized();

  const params = new URL(request.url).searchParams;
  const pathname = params.get("p") ?? "";
  const doc = parsePathname(pathname);
  if (!doc) return new Response("Not found", { status: 404 });

  const result = await get(pathname, { access: "private" });
  if (result?.statusCode !== 200) return new Response("Not found", { status: 404 });

  const fileName = `${doc.name}${doc.ext ? "." + doc.ext : ""}`;
  // Only photos and PDFs are shown in the browser. Everything else (Word, Excel,
  // and anything that could run code like HTML or SVG) is always downloaded.
  const type = result.blob.contentType;
  const viewable = (type.startsWith("image/") && type !== "image/svg+xml") || type === "application/pdf";
  const disposition = params.get("download") || !viewable ? "attachment" : "inline";

  return new Response(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType,
      "Content-Length": String(result.blob.size),
      "Content-Disposition": `${disposition}; filename="${fileName.replace(/"/g, "")}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
