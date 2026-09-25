import { NextRequest, NextResponse } from "next/server";
import { authenticate, clearLoginFailures, createSession, isLoginRateLimited, recordAudit, recordLoginFailure } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = String(body?.email || "").slice(0, 254);
  const password = String(body?.password || "").slice(0, 256);
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const identifier = address;

  if (await isLoginRateLimited(identifier)) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde 15 minutos e tente novamente." }, { status: 429 });
  }

  const user = await authenticate(email, password);

  if (!user) {
    await recordLoginFailure(identifier);
    await recordAudit({ action: "login_failed", entity: "auth", details: { email: email.trim().toLowerCase(), address } });
    return NextResponse.json({ error: "E-mail ou senha inválidos." }, { status: 401 });
  }

  await clearLoginFailures(identifier);
  await recordAudit({ userId: user.id, action: "login_success", entity: "auth", details: { address } });
  const session = await createSession(user.id);
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
