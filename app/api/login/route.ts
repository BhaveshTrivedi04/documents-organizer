import { COOKIE_MAX_AGE, COOKIE_NAME, createSessionToken } from "@/lib/auth";
import { MIN_PASSWORD_LENGTH, checkPassword, passwordMode, savePassword } from "@/lib/password";

export const dynamic = "force-dynamic";

function notReady() {
  return Response.json({ error: "The site is not set up yet (AUTH_SECRET is missing)." }, { status: 500 });
}

function storageProblem() {
  return Response.json(
    {
      error:
        "Can't reach the document storage. In Vercel, connect a Private Blob store to this project (Storage tab), then redeploy.",
    },
    { status: 500 },
  );
}

function alreadySet() {
  return Response.json({ error: "A password has already been set. Please log in." }, { status: 409 });
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
  try {
    return Response.json({ setup: (await passwordMode()) === "setup" });
  } catch (error) {
    console.error("Password check failed", error);
    return storageProblem();
  }
}

export async function POST(request: Request) {
  if (!process.env.AUTH_SECRET) return notReady();
  const { password, setup } = (await request.json().catch(() => ({}))) as { password?: string; setup?: boolean };
  if (typeof password !== "string") return Response.json({ error: "Please type the password." }, { status: 400 });
  const typed = password.trim();

  try {
    // First visit: the family chooses its password.
    if (setup) {
      if ((await passwordMode()) !== "setup") return alreadySet();
      if (typed.length < MIN_PASSWORD_LENGTH) {
        return Response.json({ error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` }, { status: 400 });
      }
      try {
        await savePassword(typed);
      } catch (error) {
        // Someone else saved one a moment earlier, or the storage failed.
        if ((await passwordMode()) !== "setup") return alreadySet();
        throw error;
      }
      return loggedIn();
    }

    // Small delay to slow down guessing.
    await new Promise((r) => setTimeout(r, 400));
    if (!(await checkPassword(typed))) {
      return Response.json({ error: "Wrong password. Please try again." }, { status: 401 });
    }
    return loggedIn();
  } catch (error) {
    console.error("Login failed", error);
    return storageProblem();
  }
}
