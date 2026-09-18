import { NextRequest, NextResponse } from "next/server";
import { deleteSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  deleteSession(request.cookies.get("pitter_session")?.value);
  const response = NextResponse.json({ ok: true });
  response.cookies.set("pitter_session", "", { httpOnly: true, expires: new Date(0), path: "/" });
  return response;
}
