import { redirect } from "next/navigation";
import { UsersClient } from "@/components/UsersClient";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export default async function UsersPage() { const user = await getCurrentUser(); if (!user || user.role !== "admin") redirect("/"); return <UsersClient />; }
