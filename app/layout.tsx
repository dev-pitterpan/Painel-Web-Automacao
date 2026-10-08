import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import "./globals.css";
import { PageContent } from "@/components/PageContent";
import { ProductPanelProvider } from "@/components/ProductPanelProvider";
import { AutomationProgressProvider } from "@/components/AutomationProgressProvider";
import { SystemUpdateProvider } from "@/components/SystemUpdateProvider";
import { Sidebar } from "@/components/Sidebar";
import { getCurrentUser } from "@/lib/auth";
import { formatBuildVersion, getBuildVersion } from "@/lib/buildVersion";

export const metadata: Metadata = {
  title: "Pitter Pan | Automação Shopify",
  description: "Dashboard da automação da Pitter Pan Festas",
  icons: {
    icon: [{ url: "/logo-pitter-com-fundo.png?v=3", type: "image/png" }],
    shortcut: [{ url: "/logo-pitter-com-fundo.png?v=3", type: "image/png" }],
    apple: [{ url: "/logo-pitter-com-fundo.png?v=3", type: "image/png" }],
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const pathname = (await headers()).get("x-pitter-pathname") || "/";
  const currentVersion = getBuildVersion();

  if (!user && pathname !== "/login") redirect("/login");
  if (user && pathname === "/login") redirect("/");

  return (
    <html lang="pt-BR">
      <body>
        {user ? (
          <ProductPanelProvider>
            <AutomationProgressProvider>
              <SystemUpdateProvider
                currentVersion={currentVersion}
                currentLabel={formatBuildVersion(currentVersion)}
              >
                <Sidebar user={user} />
                <PageContent>{children}</PageContent>
              </SystemUpdateProvider>
            </AutomationProgressProvider>
          </ProductPanelProvider>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
