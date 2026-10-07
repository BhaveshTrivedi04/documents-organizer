import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { isAuthed, unauthorized } from "@/lib/auth";
import { parsePathname } from "@/lib/docs";
import { currentPlan, limitProblem } from "@/lib/plan";
import { listDocs } from "@/lib/storage";

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
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const doc = parsePathname(pathname);
        if (!doc) throw new Error("Invalid document path");

        const plan = currentPlan();
        if (plan.total !== null || plan.perPerson !== null) {
          // Documents this upload replaces are deleted right after it, so they don't count.
          const { replaces } = JSON.parse(clientPayload || "{}") as { replaces?: string[] };
          const problem = limitProblem(plan, await listDocs(), doc.person, replaces ?? []);
          if (problem) throw new Error(problem);
        }

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
