import { DashboardClient } from "@/components/DashboardClient";
import { getCurrentUser } from "@/lib/auth";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ fromLogin?: string }>;
}) {
  const user = await getCurrentUser();
  const params = await searchParams;
  return (
    <DashboardClient
      mode="dashboard"
      greetingName={user?.name}
      loginTransition={params.fromLogin === "1"}
    />
  );
}
