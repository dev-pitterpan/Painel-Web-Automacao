import { NextResponse } from "next/server";
import { formatBuildVersion, getBuildVersion } from "@/lib/buildVersion";

export const dynamic = "force-dynamic";

export async function GET() {
  const version = getBuildVersion();
  return NextResponse.json(
    {
      version,
      label: formatBuildVersion(version),
      checkedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    },
  );
}
