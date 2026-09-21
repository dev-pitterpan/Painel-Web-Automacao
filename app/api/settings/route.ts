import { NextRequest, NextResponse } from "next/server";
import { getAppSettings, getCurrentUser, updateAppSettings } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  return NextResponse.json(getAppSettings());
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  try {
    return NextResponse.json(updateAppSettings(user, await request.json()));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível salvar." }, { status: 400 });
  }
}
