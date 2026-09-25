"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Activity, ChevronLeft, ChevronRight, CircleAlert, FileText, LayoutDashboard, LogOut, Menu, Package, RotateCcw, ScrollText, Settings, UserCog, UserRound, X } from "lucide-react";
import type { AuthUser } from "@/lib/auth";

const items: Array<[string, string, LucideIcon]> = [
  ["Dashboard", "/", LayoutDashboard],
  ["Produtos", "/produtos", Package],
  ["Reprocessados", "/reprocessados", RotateCcw],
  ["Erros", "/erros", CircleAlert],
  ["Relatórios", "/relatorios", FileText],
];

export function Sidebar({ user }: { user: AuthUser }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const navigationItems = user.role === "admin" ? [...items, ["Integrações", "/saude", Activity] as [string, string, LucideIcon], ["Usuários", "/usuarios", UserCog] as [string, string, LucideIcon], ["Auditoria", "/auditoria", ScrollText] as [string, string, LucideIcon], ["Meu perfil", "/perfil", UserRound] as [string, string, LucideIcon], ["Configurações", "/configuracoes", Settings] as [string, string, LucideIcon]] : [...items, ["Meu perfil", "/perfil", UserRound] as [string, string, LucideIcon]];

  useEffect(() => { setMobileOpen(false); }, [pathname]);
  useEffect(() => {
    document.body.classList.toggle("mobile-menu-open", mobileOpen);
    return () => document.body.classList.remove("mobile-menu-open");
  }, [mobileOpen]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
    <aside className={`sidebar ${collapsed ? "is-collapsed" : ""} ${mobileOpen ? "is-mobile-open" : ""}`}>
      <button className="mobile-menu-toggle" type="button" onClick={() => setMobileOpen(value => !value)} aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"} aria-expanded={mobileOpen}>
        {mobileOpen ? <X size={21} /> : <Menu size={21} />}
      </button>
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
        <img className="brand-logo" src="/favicon.svg" alt="Pitter Pan Festas" />
        <div>
          <div className="brand-title">Catálogo Pro</div>
          <div className="brand-sub">Automação de e-commerce</div>
        </div>
      </div>
      <nav className="nav">
        {navigationItems.map(([label, href, Icon]) => (
          <Link
            key={href}
            href={href}
            className={pathname === href ? "is-active" : undefined}
            onClick={() => setMobileOpen(false)}
          >
            {Icon && <Icon size={17} strokeWidth={2} />}
            <span>{label}</span>
          </Link>
        ))}
      </nav>
      <div className="sidebar-user">
        <Link className="sidebar-user-profile" href="/perfil" title="Personalizar perfil" aria-label="Personalizar perfil">
          <span className="avatar">{user.name.slice(0, 2).toUpperCase()}</span>
          <span className="sidebar-user-details"><strong>{user.name}</strong><small>{user.email}</small></span>
        </Link>
        <button className="user-logout" type="button" onClick={logout} aria-label="Sair" title="Sair"><LogOut size={15} /></button>
      </div>
    </aside>
    {mobileOpen && <button className="mobile-menu-backdrop" type="button" onClick={() => setMobileOpen(false)} aria-label="Fechar menu" />}
    </>
  );
}
