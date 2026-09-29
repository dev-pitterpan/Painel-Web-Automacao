import { DashboardClient } from "@/components/DashboardClient";
import { getCurrentUser } from "@/lib/auth";

export default async function Page() {
  const user = await getCurrentUser();
  return <DashboardClient mode="dashboard" greetingName={user?.name} />;
}
