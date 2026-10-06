import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME, isValidSessionToken } from "@/lib/auth";

// Sends anyone who isn't logged in to the login page. API routes check the
// session themselves, so they are not matched here.
export async function proxy(request: NextRequest) {
  const ok = await isValidSessionToken(request.cookies.get(COOKIE_NAME)?.value);
  if (!ok) return NextResponse.redirect(new URL("/login", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|api|_next|manifest.webmanifest|icon.svg|icons/|favicon.ico).*)"],
};
