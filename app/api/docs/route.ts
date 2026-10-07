import { del, rename } from "@vercel/blob";
import { isAuthed, unauthorized } from "@/lib/auth";
import { buildPathname, idFromPathname, isCategory, parsePathname } from "@/lib/docs";
import { currentPlan, limitProblem } from "@/lib/plan";
import { listDocs } from "@/lib/storage";

export const dynamic = "force-dynamic";

// All documents, and the plan's limits.
export async function GET(request: Request) {
  if (!(await isAuthed(request))) return unauthorized();
  return Response.json({ docs: await listDocs(), plan: currentPlan() });
}

// Change a document's name, category or person.
export async function PATCH(request: Request) {
  if (!(await isAuthed(request))) return unauthorized();

  const { pathname, name, category, person } = (await request.json()) as Record<string, string>;
  const doc = parsePathname(pathname ?? "");
  if (!doc || !isCategory(category)) return Response.json({ error: "Invalid request" }, { status: 400 });

  const next = buildPathname({ name, category, person, ext: doc.ext, id: idFromPathname(pathname) });
  const nextDoc = parsePathname(next)!;

  // Moving a document to another person counts against that person's limit.
  const plan = currentPlan();
  if (plan.perPerson !== null && nextDoc.person !== doc.person) {
    const problem = limitProblem({ ...plan, total: null }, await listDocs(), nextDoc.person, [pathname]);
    if (problem) return Response.json({ error: problem, limit: true }, { status: 403 });
  }

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
