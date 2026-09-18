import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const hasSession = request.cookies.has("pitter_session");
  const isAuthRoute = pathname === "/login" || pathname.startsWith("/api/auth") || pathname === "/api/n8n/reprocess/callback";
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pitter-pathname", pathname);

  if (!isAuthRoute && !hasSession) {
    if (pathname.startsWith("/api/")) {
      const response = NextResponse.json({ error: "Não autenticado." }, { status: 401 });
      return applySecurityHeaders(response);
    }
    return applySecurityHeaders(NextResponse.redirect(new URL("/login", request.url)));
  }

  return applySecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }));
}

function applySecurityHeaders(response: NextResponse) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};
