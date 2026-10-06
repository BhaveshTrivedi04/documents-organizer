import { COOKIE_MAX_AGE, COOKIE_NAME, createSessionToken } from "@/lib/auth";
import { MIN_PASSWORD_LENGTH, checkPassword, passwordMode, savePassword } from "@/lib/password";

export const dynamic = "force-dynamic";

function notReady() {
  return Response.json({ error: "The site is not set up yet (AUTH_SECRET is missing)." }, { status: 500 });
}

async function loggedIn() {
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

// Tells the login page whether to ask for the password or to create one.
export async function GET() {
  if (!process.env.AUTH_SECRET) return notReady();
  return Response.json({ setup: (await passwordMode()) === "setup" });
}

export async function POST(request: Request) {
  if (!process.env.AUTH_SECRET) return notReady();
  const { password, setup } = (await request.json().catch(() => ({}))) as { password?: string; setup?: boolean };
  if (typeof password !== "string") return Response.json({ error: "Please type the password." }, { status: 400 });
  const typed = password.trim();

  // First visit: the family chooses its password.
  if (setup) {
    if ((await passwordMode()) !== "setup") {
      return Response.json({ error: "A password has already been set. Please log in." }, { status: 409 });
    }
    if (typed.length < MIN_PASSWORD_LENGTH) {
      return Response.json({ error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` }, { status: 400 });
    }
    try {
      await savePassword(typed);
    } catch {
      return Response.json({ error: "A password has already been set. Please log in." }, { status: 409 });
    }
    return loggedIn();
  }

  // Small delay to slow down guessing.
  await new Promise((r) => setTimeout(r, 400));
  if (!(await checkPassword(typed))) {
    return Response.json({ error: "Wrong password. Please try again." }, { status: 401 });
  }
  return loggedIn();
}
