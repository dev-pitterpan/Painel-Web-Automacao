import { redirect } from "next/navigation";
import { SettingsClient } from "@/components/SettingsClient";
import { getAppSettings, getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/");
  return <SettingsClient initialSettings={await getAppSettings()} />;
}
