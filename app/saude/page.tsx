import { redirect } from "next/navigation";
import { IntegrationHealthClient } from "@/components/IntegrationHealthClient";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function IntegrationHealthPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/");
  return <IntegrationHealthClient />;
}
