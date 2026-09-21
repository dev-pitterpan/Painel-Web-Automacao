import { NextRequest, NextResponse } from "next/server";
import { createUser, getCurrentUser, listUsers, recordAudit, updateUserRole } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });
  return NextResponse.json({ users: listUsers(), currentUserId: user.id }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== "admin") return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });
  const body = await request.json().catch(() => null);
  try {
    const id = createUser(String(body?.name || ""), String(body?.email || ""), String(body?.password || ""), "user");
    recordAudit({ userId: actor.id, action: "user_created", entity: "user", details: { targetUserId: id, email: String(body?.email || "").trim().toLowerCase(), role: "user" } });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("UNIQUE") ? "Já existe um usuário com este e-mail." : error instanceof Error ? error.message : "Não foi possível criar o usuário.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== "admin") return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const userId = Number(body?.userId);
  const role = body?.role === "admin" ? "admin" : body?.role === "user" ? "user" : null;
  if (!Number.isInteger(userId) || !role) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  try { updateUserRole(actor, userId, role); return NextResponse.json({ ok: true }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível alterar o perfil." }, { status: 400 }); }
}
