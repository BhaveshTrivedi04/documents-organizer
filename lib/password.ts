// The family password. Either set as FAMILY_PASSWORD in Vercel, or chosen on the
// login page the first time the site is opened. A chosen password is stored only
// as a salted hash, in the family's own private Blob storage.

import { get, put } from "@vercel/blob";
import { timingSafeEqual } from "@/lib/auth";

const PATH = "config/password.json";
const ITERATIONS = 210_000;
export const MIN_PASSWORD_LENGTH = 6;

type Stored = { salt: string; hash: string; iterations: number };

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (hex: string) => new Uint8Array(hex.match(/../g)!.map((h) => parseInt(h, 16)));

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return toHex(new Uint8Array(bits));
}

async function readStored(): Promise<Stored | null> {
  const result = await get(PATH, { access: "private", useCache: false });
  if (result?.statusCode !== 200) return null;
  return (await new Response(result.stream).json()) as Stored;
}

/** "env": set in Vercel. "stored": chosen on first visit. "setup": not chosen yet. */
export async function passwordMode(): Promise<"env" | "stored" | "setup"> {
  if (process.env.FAMILY_PASSWORD) return "env";
  return (await readStored()) ? "stored" : "setup";
}

export async function checkPassword(password: string): Promise<boolean> {
  const fromEnv = process.env.FAMILY_PASSWORD;
  if (fromEnv) return timingSafeEqual(password, fromEnv);
  const stored = await readStored();
  if (!stored) return false;
  return timingSafeEqual(await derive(password, fromHex(stored.salt), stored.iterations), stored.hash);
}

/** Saves the first password. Fails if one already exists, so it can only be chosen once. */
export async function savePassword(password: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const stored: Stored = { salt: toHex(salt), hash: await derive(password, salt, ITERATIONS), iterations: ITERATIONS };
  await put(PATH, JSON.stringify(stored), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: false,
  });
}
