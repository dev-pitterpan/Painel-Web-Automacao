import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import "./globals.css";
import { PageContent } from "@/components/PageContent";
import { ProductPanelProvider } from "@/components/ProductPanelProvider";
import { AutomationProgressProvider } from "@/components/AutomationProgressProvider";
import { Sidebar } from "@/components/Sidebar";
import { getCurrentUser } from "@/lib/auth";

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

  if (!user && pathname !== "/login") redirect("/login");
  if (user && pathname === "/login") redirect("/");

  return (
    <html lang="pt-BR">
      <body>
        {user ? (
          <ProductPanelProvider>
            <AutomationProgressProvider>
              <Sidebar user={user} />
              <PageContent>{children}</PageContent>
            </AutomationProgressProvider>
          </ProductPanelProvider>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
