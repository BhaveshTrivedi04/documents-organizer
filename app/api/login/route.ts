import { COOKIE_MAX_AGE, COOKIE_NAME, createSessionToken, timingSafeEqual } from "@/lib/auth";

export async function POST(request: Request) {
  const { password } = (await request.json().catch(() => ({}))) as { password?: string };
  const expected = process.env.FAMILY_PASSWORD;
  if (!expected || !process.env.AUTH_SECRET) {
    return Response.json({ error: "The site is not set up yet (missing password settings)." }, { status: 500 });
  }
  // Small delay to slow down guessing.
  await new Promise((r) => setTimeout(r, 400));
  if (typeof password !== "string" || !timingSafeEqual(password.trim(), expected)) {
    return Response.json({ error: "Wrong password. Please try again." }, { status: 401 });
  }
  const token = await createSessionToken();
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return Response.json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${secure}`,
      },
    },
  );
}
