"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { ChevronLeft, ChevronRight, CircleAlert, FileText, LayoutDashboard, LogOut, Package } from "lucide-react";
import type { AuthUser } from "@/lib/auth";

const items: Array<[string, string, LucideIcon]> = [
  ["Dashboard", "/", LayoutDashboard],
  ["Produtos", "/produtos", Package],
  ["Erros", "/erros", CircleAlert],
  ["Relatórios", "/relatorios", FileText],
];

export function Sidebar({ user }: { user: AuthUser }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <aside className={`sidebar ${collapsed ? "is-collapsed" : ""}`}>
      <button
        className="sidebar-toggle"
        type="button"
        aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
        title={collapsed ? "Expandir menu" : "Recolher menu"}
        onClick={() => setCollapsed(value => !value)}
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
      <div className="brand">
        <img className="brand-logo" src="/logo-pitter-com-fundo.png" alt="Pitter Pan Festas" />
        <div>
          <div className="brand-title">Catálogo Pro</div>
          <div className="brand-sub">Automação de e-commerce</div>
        </div>
      </div>
      <nav className="nav">
        {items.map(([label, href, Icon]) => (
          <Link
            key={href}
            href={href}
            className={pathname === href ? "is-active" : undefined}
          >
            {Icon && <Icon size={17} strokeWidth={2} />}
            <span>{label}</span>
          </Link>
        ))}
      </nav>
      <div className="sidebar-user">
        <span className="avatar">{user.name.slice(0, 2).toUpperCase()}</span>
        <span><strong>{user.name}</strong><small>{user.email}</small></span>
        <button className="user-logout" type="button" onClick={logout} aria-label="Sair" title="Sair"><LogOut size={15} /></button>
      </div>
    </aside>
  );
}
