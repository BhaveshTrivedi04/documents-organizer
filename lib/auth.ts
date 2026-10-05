// Simple family login: one shared password, then a signed cookie that lasts a year
// so nobody has to log in again on their phone. Uses Web Crypto so it works in
// both the proxy and the API routes.

export const COOKIE_NAME = "family_docs_session";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

async function hmac(value: string): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Including the password in the signed value means changing FAMILY_PASSWORD
// logs everyone out.
export async function createSessionToken(): Promise<string> {
  const issued = Date.now().toString();
  return `${issued}.${await hmac(`${issued}:${process.env.FAMILY_PASSWORD}`)}`;
}

export async function isValidSessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [issued, sig] = token.split(".");
  if (!issued || !sig) return false;
  const expected = await hmac(`${issued}:${process.env.FAMILY_PASSWORD}`);
  return timingSafeEqual(sig, expected);
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function isAuthed(request: Request): Promise<boolean> {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  return isValidSessionToken(match?.[1]);
}

export function unauthorized() {
  return Response.json({ error: "Please log in again." }, { status: 401 });
}
