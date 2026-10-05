import { COOKIE_NAME } from "@/lib/auth";

export async function POST() {
  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` } },
  );
}
