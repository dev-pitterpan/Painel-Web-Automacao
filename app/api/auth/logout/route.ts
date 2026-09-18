import { NextRequest, NextResponse } from "next/server";
import { deleteSession, getCurrentUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (!await getCurrentUser()) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  deleteSession(request.cookies.get("pitter_session")?.value);
  const response = NextResponse.json({ ok: true });
  response.cookies.set("pitter_session", "", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", expires: new Date(0), path: "/" });
  return response;
}
