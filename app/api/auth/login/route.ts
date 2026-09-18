import { NextRequest, NextResponse } from "next/server";
import { authenticate, clearLoginFailures, createSession, isLoginRateLimited, recordLoginFailure } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = String(body?.email || "").slice(0, 254);
  const password = String(body?.password || "").slice(0, 256);
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const identifier = address;

  if (isLoginRateLimited(identifier)) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde 15 minutos e tente novamente." }, { status: 429 });
  }

  const user = authenticate(email, password);

  if (!user) {
    recordLoginFailure(identifier);
    return NextResponse.json({ error: "E-mail ou senha inválidos." }, { status: 401 });
  }

  clearLoginFailures(identifier);
  const session = createSession(user.id);
  const response = NextResponse.json({ user });
  response.cookies.set("pitter_session", session.token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12
  });
  return response;
}
