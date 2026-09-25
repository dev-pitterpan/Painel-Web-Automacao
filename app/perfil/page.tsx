import { redirect } from "next/navigation";
import { ProfileClient } from "@/components/ProfileClient";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <ProfileClient user={user} />;
}
