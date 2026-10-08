export function getBuildVersion() {
  return String(
    process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.VERCEL_DEPLOYMENT_ID ||
      process.env.VERCEL_URL ||
      process.env.NEXT_PUBLIC_BUILD_ID ||
      process.env.npm_package_version ||
      "local",
  ).trim();
}

export function formatBuildVersion(version: string) {
  const value = String(version || "local").trim();
  if (value === "local") return "Build local";
  if (/^[a-f\d]{7,}$/i.test(value)) return `Build ${value.slice(0, 7)}`;
  let hash = 0;
  for (let index = 0; index < value.length; index += 1)
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  return `Build ${hash.toString(16).padStart(7, "0").slice(0, 7)}`;
}
