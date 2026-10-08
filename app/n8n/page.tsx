import { redirect } from "next/navigation";
import { N8nExecutionsClient } from "@/components/N8nExecutionsClient";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function N8nPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/");
  return <N8nExecutionsClient />;
}
