import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { isAuthed, unauthorized } from "@/lib/auth";
import { parsePathname } from "@/lib/docs";

// Files go straight from the phone to Vercel Blob (no size limit from our
// server). This route only hands out a one-time upload permission.
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;

  if (body.type === "blob.generate-client-token" && !(await isAuthed(request))) {
    return unauthorized();
  }

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!parsePathname(pathname)) throw new Error("Invalid document path");
        // Any file type is allowed (photos, PDFs, Word, Excel…).
        return {
          maximumSizeInBytes: 100 * 1024 * 1024,
          addRandomSuffix: false,
          allowOverwrite: false,
        };
      },
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}
