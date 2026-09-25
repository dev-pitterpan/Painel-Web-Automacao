import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, updateOwnProfile } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  return NextResponse.json({ user }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: NextRequest) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const body = await request.json().catch(() => null);

  try {
    const user = await updateOwnProfile(actor, {
      name: String(body?.name || ""),
      email: String(body?.email || ""),
      currentPassword: String(body?.currentPassword || ""),
      newPassword: body?.newPassword ? String(body.newPassword) : "",
    });
    return NextResponse.json({ ok: true, user });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar o perfil." }, { status: 400 });
  }
}
