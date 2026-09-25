import { NextRequest, NextResponse } from "next/server";
import { createUser, deleteManagedUser, getCurrentUser, listUsers, recordAudit, updateManagedUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });
  return NextResponse.json({ users: await listUsers(), currentUserId: user.id }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== "admin") return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });
  const body = await request.json().catch(() => null);
  try {
    const id = await createUser(String(body?.name || ""), String(body?.email || ""), String(body?.password || ""), "user");
    await recordAudit({ userId: actor.id, action: "user_created", entity: "user", details: { targetUserId: id, email: String(body?.email || "").trim().toLowerCase(), role: "user" } });
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
  if (!Number.isInteger(userId)) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  const role = body?.role === "admin" ? "admin" : body?.role === "user" ? "user" : undefined;
  try {
    await updateManagedUser(actor, userId, { name: body?.name === undefined ? undefined : String(body.name), email: body?.email === undefined ? undefined : String(body.email), role, password: body?.password === undefined ? undefined : String(body.password) });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível editar o usuário." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== "admin") return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const userId = Number(body?.userId);
  if (!Number.isInteger(userId)) return NextResponse.json({ error: "Usuário inválido." }, { status: 400 });
  try { await deleteManagedUser(actor, userId); return NextResponse.json({ ok: true }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível excluir o usuário." }, { status: 400 }); }
}
