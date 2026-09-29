"use client";

import { usePathname } from "next/navigation";

export function PageContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const backgroundVariant =
    pathname === "/"
      ? "dashboard"
      : pathname.startsWith("/erros")
        ? "errors"
        : pathname.startsWith("/reprocessados")
          ? "reprocessed"
          : "default";

  return (
    <main className={`content content--${backgroundVariant}`}>{children}</main>
  );
}
