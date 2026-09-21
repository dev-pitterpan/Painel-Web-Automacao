import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
// Next.js processes global CSS imports at build time; no TypeScript module is emitted for them.
// @ts-expect-error Global CSS has no runtime TypeScript declarations.
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Pitter Pan | Automação Shopify",
  description: "Dashboard da automação da Pitter Pan Festas",
  icons: {
    icon: "/logo-pitter-com-fundo.png",
    shortcut: "/logo-pitter-com-fundo.png",
    apple: "/logo-pitter-com-fundo.png"
  }
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const pathname = (await headers()).get("x-pitter-pathname") || "/";

  if (!user && pathname !== "/login") redirect("/login");
  if (user && pathname === "/login") redirect("/");

  return (
    <html lang="pt-BR">
      <body>
        {user ? (
          <div className="app-shell">
            <Sidebar user={user} />
            <main className="content">{children}</main>
          </div>
        ) : children}
      </body>
    </html>
  );
}
